import { defaultLegal, legalTitles } from './legal';
import {generateSlotTimes} from './slot-times';
import { flushNotices, subscriptionReady } from './notifications';
import QRCode from 'qrcode';
import { env } from 'cloudflare:workers';
const conf = env as unknown as Record<string, any>;
const db = () => conf.DB as D1Database;
const q = (sql: string, ...values: any[]) =>
  db()
    .prepare(sql)
    .bind(...values);
const all = async (sql: string, ...values: any[]) =>
  (await q(sql, ...values).all()).results as any[];
const one = async (sql: string, ...values: any[]) =>
  (await q(sql, ...values).first()) as any;
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
async function passwordHash(password:string,salt:string) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return Array.from(new Uint8Array(bits),v=>v.toString(16).padStart(2,'0')).join('');
}
class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const assert = (condition: any, message: string, status = 400) => {
  if (!condition) throw new ApiError(message, status);
};
const text = (v: any, max = 200) =>
  typeof v === 'string' && v.trim().length <= max ? v.trim() : '';
const experienceNames = [
  '鎏金美甲 Beauty Bar',
  '微醺特调 Gold Bar',
  '仅登岛参观',
];
async function validSlotExperience(eventId:string,experience:unknown) {
  if (experience === '') return !(await one('SELECT id FROM experiences WHERE event_id=? LIMIT 1',eventId));
  return typeof experience === 'string' && !!(await one('SELECT id FROM experiences WHERE event_id=? AND name=? AND enabled=1',eventId,experience));
}
async function session(req: Request, admin = false) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const s =
    token &&
    (await one(
      'SELECT * FROM sessions WHERE hash=? AND expires_at>?',
      await hash(token),
      Date.now(),
    ));
  assert(s, '请先登录', 401);
  assert(
    !s.user_id.startsWith('demo-'),
    '登录已失效，请重新登录',
    401,
  );
  assert(!admin || s.role === 'admin', '没有管理权限', 403);
  if (s.role === 'admin') assert(await one('SELECT id FROM admin_users WHERE id=? AND enabled=1',s.user_id),'账号已停用，请重新登录',401);
  return s;
}
async function issue(userId: string, role: string) {
  const token = uuid() + uuid();
  await q(
    'INSERT INTO sessions VALUES(?,?,?,?)',
    await hash(token),
    userId,
    role,
    Date.now() + 7 * 86400000,
  ).run();
  return { token, role, demo: false };
}
async function wxToken() {
  assert(
    conf.WECHAT_APP_ID && conf.WECHAT_APP_SECRET,
    '请配置微信 AppID 与 AppSecret',
    503,
  );
  const r: any = await (
    await fetch(
      'https://api.weixin.qq.com/cgi-bin/token?' +
        new URLSearchParams({
          grant_type: 'client_credential',
          appid: conf.WECHAT_APP_ID,
          secret: conf.WECHAT_APP_SECRET,
        }),
    )
  ).json();
  assert(r.access_token, '微信服务暂不可用', 502);
  return r.access_token;
}
const joined = `SELECT b.*,e.title,e.subtitle,e.description,e.notices,e.contact_wechat,e.contact_qr,e.location,s.experience,s.date,s.time FROM bookings b JOIN events e ON b.event_id=e.id JOIN slots s ON b.slot_id=s.id`;
const upcoming = (s: any) => new Date(`${s.date}T${s.time}:00+08:00`).getTime();
const promote = (slotId: string) =>
  q(
    `UPDATE bookings SET status='confirmed' WHERE id=(SELECT id FROM bookings WHERE slot_id=? AND status='waitlisted' ORDER BY created_at,id LIMIT 1) AND (SELECT COUNT(*) FROM bookings WHERE slot_id=? AND status IN ('confirmed','checked'))<(SELECT capacity FROM slots WHERE id=?)`,
    slotId,
    slotId,
    slotId,
  );
export async function handle(req: Request) {
  try {
    const path = new URL(req.url).pathname.replace(/^\/api\//, '');
    const method = req.method;
    const uploadPath = /^images\/([a-f0-9-]{36})$/.exec(path);
    if (uploadPath && method === 'GET') {
      const row = await one("SELECT payload FROM content_settings WHERE id=?", 'image:' + uploadPath[1]);
      assert(row, '图片不存在', 404);
      const image = JSON.parse(row.payload);
      return new Response(Uint8Array.from(atob(image.data), c => c.charCodeAt(0)), { headers: { 'Content-Type': image.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (path === 'admin/images' && method === 'POST') {
      await session(req, true);
      assert(Number(req.headers.get('content-length') || 0) <= 1048576, '图片不能超过1MB');
      const bytes = new Uint8Array(await req.arrayBuffer());
      assert(bytes.length > 0 && bytes.length <= 1048576, '图片不能超过1MB');
      const prefix = Array.from(bytes.slice(0, 12));
      const type = prefix.slice(0,8).join(',') === '137,80,78,71,13,10,26,10' ? 'image/png' : prefix[0]===255 && prefix[1]===216 && prefix[2]===255 ? 'image/jpeg' : String.fromCharCode(...prefix.slice(0,6)).match(/^GIF8[79]a$/) ? 'image/gif' : String.fromCharCode(...prefix.slice(0,4))==='RIFF' && String.fromCharCode(...prefix.slice(8,12))==='WEBP' ? 'image/webp' : '';
      assert(type, '仅支持JPG、PNG、WebP或GIF图片');
      let binary = ''; for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      const id = uuid();
      await q('INSERT INTO content_settings(id,payload) VALUES(?,?)', 'image:'+id, JSON.stringify({type,data:btoa(binary)})).run();
      return response({url:new URL('/api/images/'+id, req.url).href});
    }
    const validImage = (value:string) => {
      try { const u = new URL(value); return !u.username && !u.password && (u.protocol === 'https:' || (u.origin === new URL(req.url).origin && /^\/api\/images\/[a-f0-9-]{36}$/.test(u.pathname) && !u.search && !u.hash)); } catch { return false; }
    };
    const b: any = method === 'GET' ? {} : await req.json().catch(() => ({}));
    if (path === 'legal' && method === 'GET') {
      const row = await one("SELECT payload FROM content_settings WHERE id='legal'");
      return response(row ? JSON.parse(row.payload) : defaultLegal);
    }
    if (path === 'content' && method === 'GET') {
      const row = await one("SELECT payload FROM content_settings WHERE id='home'");
      const c = row ? JSON.parse(row.payload) : { splash: null, slides: [] };
      return response({ splash: c.splash?.enabled ? c.splash : null, slides: c.slides.filter((s: any) => s.enabled) });
    }
    if (path === 'config')
      return response({
        demo: false,
        subscriptionTemplateId:
          subscriptionReady()
            ? conf.WECHAT_SUBSCRIBE_TEMPLATE_ID
            : '',
      });
    if (path === 'auth/demo') return response({error:'演示登录已停用，请使用正式登录'}, 403);
    if (path === 'auth/me' && method === 'GET') {
      const s=await session(req);
      assert(s.role==='user','请使用用户身份登录',403);
      const user=await one('SELECT phone FROM users WHERE id=?',s.user_id);
      return response({authenticated:true,phone:user?.phone||'',demo:false});
    }
    if (path === 'auth/logout' && method === 'POST') {
      const token = req.headers.get('authorization')?.replace(/^Bearer /, '') || '';
      if (token) await q('DELETE FROM sessions WHERE hash=?', await hash(token)).run();
      return response({ success: true });
    }
    if (path === 'auth/admin' && method === 'POST') {
      const account=await one('SELECT * FROM admin_users WHERE username=?',text(b.username,40));
      assert(typeof b.password==='string' && b.password.length<=128,'账号或密码不正确',401);
      const digest=await passwordHash(b.password,account?.salt || 'invalid-account-salt');
      assert(account?.enabled && digest===account.password_hash,'账号或密码不正确',401);
      return response(await issue(account.id,'admin'));
    }
    if (path === 'auth/wechat' && method === 'POST') {
      assert(text(b.code), '缺少微信登录凭证');
      assert(
        conf.WECHAT_APP_ID && conf.WECHAT_APP_SECRET,
        '微信登录尚未配置',
        503,
      );
      const r: any = await (
        await fetch(
          'https://api.weixin.qq.com/sns/jscode2session?' +
            new URLSearchParams({
              appid: conf.WECHAT_APP_ID,
              secret: conf.WECHAT_APP_SECRET,
              js_code: b.code,
              grant_type: 'authorization_code',
            }),
        )
      ).json();
      assert(r.openid, '微信登录失败，请重试', 401);
      const id = uuid();
      await q(
        'INSERT OR IGNORE INTO users(id,openid,created_at) VALUES(?,?,?)',
        id,
        r.openid,
        now(),
      ).run();
      const user = await one('SELECT id FROM users WHERE openid=?', r.openid);
      return response(await issue(user.id, 'user'));
    }
    if (path === 'phone' && method === 'POST') {
      const s = await session(req);
      assert(text(b.code), '请授权手机号');
      const token = await wxToken();
      const r: any = await (
        await fetch(
          `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`,
          { method: 'POST', body: JSON.stringify({ code: b.code }) },
        )
      ).json();
      assert(
        r.errcode === 0 && r.phone_info?.purePhoneNumber,
        '手机号授权失败，请重试',
      );
      await q(
        'UPDATE users SET phone=? WHERE id=?',
        r.phone_info.purePhoneNumber,
        s.user_id,
      ).run();
      return response({ phone: r.phone_info.purePhoneNumber });
    }
    if (path === 'events' && method === 'GET') {

      return response(
        await all(
          "SELECT * FROM events WHERE status IN ('published','ended') ORDER BY start_date DESC",
        ),
      );
    }
    if (path.startsWith('events/') && method === 'GET') {
      const e = await one(
        "SELECT * FROM events WHERE id=? AND status IN ('published','ended')",
        path.split('/')[1],
      );
      assert(e, '活动不存在', 404);
      const slots = await all(
        `SELECT s.*,(SELECT COUNT(*) FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('confirmed','checked')) AS booked,(SELECT COUNT(*) FROM bookings b WHERE b.slot_id=s.id AND b.status='waitlisted') AS waiting FROM slots s WHERE event_id=? ORDER BY date,time`,
        e.id,
      );
      return response({ ...e, slots });
    }
    if (path === 'bookings' && method === 'GET') {
      const s = await session(req);
      return response(
        await all(
          joined + ' WHERE b.user_id=? ORDER BY b.created_at DESC',
          s.user_id,
        ),
      );
    }
    if (path === 'bookings' && method === 'POST') {
      const s = await session(req);
      assert(s.role === 'user', '请使用用户身份预约');
      assert(text(b.name, 40), '请填写真实姓名');
      assert(/^1[3-9]\d{9}$/.test(b.phone), '请填写有效手机号');
      assert(['女', '男', '不便透露'].includes(b.gender), '请选择性别');
      assert(b.terms === true, '请阅读并同意预约条款');
      const slot = await one(
        'SELECT s.*,e.status FROM slots s JOIN events e ON e.id=s.event_id WHERE s.id=?',
        b.slotId,
      );
      assert(slot && slot.status === 'published', '该场次未开放预约');
      assert(upcoming(slot) > Date.now(), '该场次已开始');
      {
        const u = await one('SELECT phone FROM users WHERE id=?', s.user_id);
        assert(u?.phone === b.phone, '请先授权验证手机号', 403);
      }
      const id = uuid();
      await q(
        `INSERT INTO bookings(id,event_id,slot_id,user_id,name,phone,gender,status,photo_consent,terms_version,code,created_at) VALUES(?,?,?,?,?,?,?,CASE WHEN (SELECT COUNT(*) FROM bookings WHERE slot_id=? AND status IN ('confirmed','checked')) < (SELECT capacity FROM slots WHERE id=?) THEN 'confirmed' ELSE 'waitlisted' END,?,?,?,?)`,
        id,
        slot.event_id,
        slot.id,
        s.user_id,
        text(b.name, 40),
        b.phone,
        b.gender,
        slot.id,
        slot.id,
        b.photoConsent ? 1 : 0,
        '2026-09-07',
        `${Date.now()}-${uuid()}`,
        now(),
      ).run();
      await q(
        'UPDATE users SET name=?,phone=? WHERE id=?',
        text(b.name, 40),
        b.phone,
        s.user_id,
      ).run();
      return response(await one(joined + ' WHERE b.id=?', id));
    }
    if (/^bookings\/[^/]+\/subscribe$/.test(path) && method === 'POST') {
      const user = await session(req);
      assert(subscriptionReady(), '订阅服务尚未配置', 503);
      const booking = await one(
        'SELECT id,status FROM bookings WHERE id=? AND user_id=?',
        path.split('/')[1],
        user.user_id,
      );
      assert(
        booking && ['confirmed', 'waitlisted'].includes(booking.status),
        '此预约不可订阅',
      );
      await q(
        "INSERT INTO notifications(booking_id,status,updated_at) VALUES(?,'pending',?) ON CONFLICT(booking_id) DO UPDATE SET status='pending',last_error=NULL,updated_at=excluded.updated_at WHERE notifications.status NOT IN ('pending','sending','unknown')",
        booking.id,
        now(),
      ).run();
      await flushNotices();
      return response({ ok: true });
    }
    if (
      /^bookings\/[^/]+\/(cancel|reschedule)$/.test(path) &&
      method === 'POST'
    ) {
      const s = await session(req);
      const [, id, action] = path.split('/');
      const booking = await one(
        joined + ' WHERE b.id=? AND b.user_id=?',
        id,
        s.user_id,
      );
      assert(booking, '预约不存在', 404);
      assert(
        ['confirmed', 'waitlisted'].includes(booking.status),
        '此预约不能修改',
      );
      assert(
        upcoming(booking) - Date.now() >= 8 * 3600000,
        '距预约时间不足 8 小时，无法修改或取消',
      );
      if (action === 'cancel') {
        await db().batch([
          q(
            "UPDATE bookings SET status='cancelled' WHERE id=? AND status IN ('confirmed','waitlisted')",
            id,
          ),
          promote(booking.slot_id),
        ]);
      } else {
        const target = await one(
          'SELECT s.*,e.status FROM slots s JOIN events e ON e.id=s.event_id WHERE s.id=? AND s.event_id=?',
          b.slotId,
          booking.event_id,
        );
        assert(
          target &&
            target.status === 'published' &&
            upcoming(target) - Date.now() >= 8 * 3600000,
          '新场次须距当前至少 8 小时',
        );
        assert(target.id !== booking.slot_id, '请选择其他场次');
        await db().batch([
          q(
            `UPDATE bookings SET slot_id=?,status=CASE WHEN (SELECT COUNT(*) FROM bookings WHERE slot_id=? AND status IN ('confirmed','checked')) < (SELECT capacity FROM slots WHERE id=?) THEN 'confirmed' ELSE 'waitlisted' END WHERE id=? AND status IN ('confirmed','waitlisted')`,
            target.id,
            target.id,
            target.id,
            id,
          ),
          promote(booking.slot_id),
        ]);
      }
      await flushNotices();
      return response(await one(joined + ' WHERE b.id=?', id));
    }
    if (/^bookings\/[^/]+\/ticket$/.test(path)) {
      const s = await session(req);
      const booking = await one(
        joined + ' WHERE b.id=? AND b.user_id=?',
        path.split('/')[1],
        s.user_id,
      );
      assert(
        booking && ['confirmed', 'checked'].includes(booking.status),
        '当前预约暂无入场凭证',
      );
      const qr = QRCode.create('HG:' + booking.code, {
        errorCorrectionLevel: 'M',
      });
      return response({
        booking,
        qr: { size: qr.modules.size, data: Array.from(qr.modules.data) },
      });
    }
    if (path.startsWith('admin/')) {
      const operator=await session(req, true);
      if (path === 'admin/users' && method === 'GET') return response({currentId:operator.user_id,users:await all('SELECT id,username,enabled,created_at FROM admin_users ORDER BY created_at,id')});
      if (path === 'admin/users' && method === 'POST') {
        assert(/^[a-zA-Z0-9_-]{3,40}$/.test(b.username||''),'账号需为3至40位字母、数字、下划线或短横线');
        assert(typeof b.password==='string' && b.password.length>=5 && b.password.length<=128,'密码需为5至128位');
        assert(!await one('SELECT id FROM admin_users WHERE username=?',b.username),'账号已存在');
        const salt=uuid();
        await q('INSERT INTO admin_users(id,username,password_hash,salt,enabled,created_at) VALUES(?,?,?,?,1,?)',uuid(),b.username,await passwordHash(b.password,salt),salt,now()).run();
        return response({ok:true});
      }
      if (path === 'admin/users/password' && method === 'POST') {
        const target=await one('SELECT * FROM admin_users WHERE id=?',b.id);
        assert(target,'账号不存在',404);
        if(target.id===operator.user_id) assert(typeof b.oldPassword==='string' && b.oldPassword.length<=128 && await passwordHash(b.oldPassword,target.salt)===target.password_hash,'当前密码不正确');
        assert(typeof b.password==='string' && b.password.length>=5 && b.password.length<=128,'密码需为5至128位');
        const salt=uuid();
        await db().batch([q('UPDATE admin_users SET password_hash=?,salt=? WHERE id=?',await passwordHash(b.password,salt),salt,target.id),q("DELETE FROM sessions WHERE user_id=? AND role='admin'",target.id)]);
        return response({ok:true,relogin:target.id===operator.user_id});
      }
      if (path === 'admin/users/status' && method === 'POST') {
        assert(b.id!==operator.user_id,'不能停用当前登录账号');
        assert(typeof b.enabled==='boolean','状态无效');
        await db().batch([q('UPDATE admin_users SET enabled=? WHERE id=?',b.enabled?1:0,b.id),q("DELETE FROM sessions WHERE user_id=? AND role='admin'",b.id)]);
        return response({ok:true});
      }
      if (path === 'admin/legal') {
        if (method === 'GET') {
          const row = await one("SELECT payload FROM content_settings WHERE id='legal'");
          return response(row ? JSON.parse(row.payload) : defaultLegal);
        }
        assert(method === 'POST', '不支持的操作', 405);
        const value: Record<string,string> = {};
        for (const key of Object.keys(legalTitles) as (keyof typeof legalTitles)[]) {
          assert(typeof b[key] === 'string' && b[key].trim().length > 0 && b[key].length <= 20000, legalTitles[key] + '请填写1至20000字');
          value[key] = b[key].trim();
        }
        await q("INSERT INTO content_settings(id,payload) VALUES('legal',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", JSON.stringify(value)).run();
        return response(value);
      }
      if (path === 'admin/content') {
        if (method === 'GET') {
          const row = await one("SELECT payload FROM content_settings WHERE id='home'");
          return response(row ? JSON.parse(row.payload) : { splash: { title: '', image: '', eventId: '', enabled: false, duration: 3 }, slides: [] });
        }
        assert(method === 'POST', '不支持的操作', 405);
        assert(b.splash && Array.isArray(b.slides) && b.slides.length <= 10, '最多添加10张轮播图');
        const clean = async (x: any) => {
          assert(x && typeof x.enabled === 'boolean', '配置格式错误');
          assert(typeof x.image === 'string' && x.image.trim().length <= 2048, '图片地址不能超过2048个字符，请使用直接图片链接');
          assert(typeof x.title === 'string' && x.title.trim().length <= 80, '标题不能超过80个字符');
          assert(typeof x.eventId === 'string' && x.eventId.trim().length <= 100, '关联活动格式错误');
          const image = text(x.image, 2048), title = text(x.title, 80), eventId = text(x.eventId, 100);
          assert(!x.enabled || image, '启用时必须填写图片地址');
          if (image) { let u; try { u = new URL(image); } catch {} assert(validImage(image), '图片请使用HTTPS地址'); }
          if (eventId) assert(await one('SELECT id FROM events WHERE id=?', eventId), '关联活动不存在');
          return { title, image, eventId, enabled: x.enabled };
        };
        assert(Number.isInteger(b.splash.duration) && b.splash.duration >= 1 && b.splash.duration <= 10, '开屏时间须为1至10秒');
        const value = { splash: { ...await clean(b.splash), duration: b.splash.duration }, slides: await Promise.all(b.slides.map(clean)) };
        await q("INSERT INTO content_settings(id,payload) VALUES('home',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", JSON.stringify(value)).run();
        return response(value);
      }
      if (path === 'admin/notifications' && method === 'POST') {
        await q(
          "UPDATE notifications SET status='pending' WHERE status='failed'",
        ).run();
        await flushNotices();
        return response({ ok: true });
      }
      if (path === 'admin/overview') {

        return response({
          experiences: await all('SELECT * FROM experiences ORDER BY rowid'),
          events: await all('SELECT * FROM events ORDER BY created_at DESC'),
          bookings: await all(joined + ' ORDER BY b.created_at DESC'),
          slots: await all(
            `SELECT s.*,e.title,(SELECT COUNT(*) FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('confirmed','checked')) AS booked,(SELECT COUNT(*) FROM bookings b WHERE b.slot_id=s.id AND b.status='waitlisted') AS waiting FROM slots s JOIN events e ON e.id=s.event_id ORDER BY s.date,s.time`,
          ),
          users: await all(
            'SELECT u.id,u.name,u.phone,u.created_at,(SELECT latest.gender FROM bookings latest WHERE latest.user_id=u.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AS gender,COUNT(b.id) AS bookings FROM users u LEFT JOIN bookings b ON b.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC',
          ),
          notifications: await all('SELECT * FROM notifications'),
          demo: false,
        });
      }
      if (path === 'admin/experiences/delete' && method === 'POST') {
        const item = await one('SELECT * FROM experiences WHERE id=? AND event_id=?',b.id,b.eventId);
        assert(item,'体验不存在',404);
        const result = await q('DELETE FROM experiences WHERE id=? AND event_id=? AND NOT EXISTS(SELECT 1 FROM slots WHERE event_id=? AND experience=?)',b.id,b.eventId,b.eventId,item.name).run();
        assert(result.meta.changes === 1,'此体验仍有关联场次，请先调整或删除场次；有预约记录时可停用体验');
        return response({ok:true});
      }
      if (path === 'admin/experiences' && method === 'POST') {
        const name = text(b.name,80);
        assert(await one('SELECT id FROM events WHERE id=?',b.eventId), '请选择所属活动');
        assert(name && typeof b.enabled === 'boolean', '请填写体验名称（最多80字）及启用状态');
        assert(!(await one('SELECT id FROM experiences WHERE event_id=? AND name=? AND id<>?',b.eventId,name,b.id||'')), '体验名称已存在');
        if (b.id) {
          const previous = await one('SELECT * FROM experiences WHERE id=? AND event_id=?',b.id,b.eventId);
          assert(previous,'体验不存在',404);
          await db().batch([
            q('UPDATE experiences SET name=?,enabled=? WHERE id=?',name,b.enabled?1:0,b.id),
            q('UPDATE slots SET experience=? WHERE experience=? AND event_id=?',name,previous.name,b.eventId),
          ]);
        } else await q('INSERT INTO experiences(id,event_id,name,enabled) VALUES(?,?,?,?)',uuid(),b.eventId,name,b.enabled?1:0).run();
        return response({ok:true});
      }
      if (path === 'admin/events' && method === 'POST') {
        const media: Record<string,string> = {};
        if(b.contact_wechat !== undefined){assert(typeof b.contact_wechat==='string' && b.contact_wechat.trim().length<=100,'客服微信最多100字');media.contact_wechat=b.contact_wechat.trim();}
        if(b.contact_qr !== undefined){assert(typeof b.contact_qr==='string' && b.contact_qr.trim().length<=2048,'客服二维码地址无效');const value=b.contact_qr.trim();if(value){let url;try{url=new URL(value)}catch{}assert(validImage(value),'客服二维码请填写HTTPS图片地址');}media.contact_qr=value;}

        if (b.notices !== undefined) {
          assert(typeof b.notices === 'string' && b.notices.trim().length <= 8000, '活动须知不能超过8000字');
          media.notices = b.notices.trim();
        }
        if (b.summary !== undefined) {
          assert(typeof b.summary === 'string' && b.summary.trim().length <= 300, '首页活动简介不能超过300字');
          media.summary = b.summary.trim();
        }
        for (const field of ['cover_image','hero_image','detail_images']) {
          if (b[field] === undefined) continue;
          assert(typeof b[field] === 'string', '图片配置格式错误');
          const urls = b[field].split(/\r?\n/).map((v:string)=>v.trim()).filter(Boolean);
          assert(urls.length <= (field === 'detail_images' ? 20 : 1), '封面和顶部图各限1张，详情图最多20张');
          for (const url of urls) {
            let parsed; try { parsed = new URL(url); } catch {}
            assert(url.length <= 2048 && validImage(url), '请填写有效的HTTPS图片地址，每个地址不能超过2048字符');
          }
          media[field] = urls.join('\n');
        }

        assert(
          text(b.title, 100) &&
            text(b.location, 200) &&
            text(b.description, 8000),
          '请填写活动名称、地点和介绍',
        );
        assert(
          /^\d{4}-\d{2}-\d{2}$/.test(b.start_date) &&
            /^\d{4}-\d{2}-\d{2}$/.test(b.end_date) &&
            b.start_date <= b.end_date,
          '活动日期不正确',
        );
        const id = b.id || uuid();
        if (b.id) {
          assert(
            await one('SELECT id FROM events WHERE id=?', id),
            '活动不存在',
            404,
          );
          const invalid = await one(
            'SELECT id FROM slots WHERE event_id=? AND (date<? OR date>?)',
            id,
            b.start_date,
            b.end_date,
          );
          assert(!invalid, '已有场次超出新日期范围，请先调整场次');
          await q(
            'UPDATE events SET title=?,subtitle=?,description=?,location=?,start_date=?,end_date=? WHERE id=?',
            text(b.title, 100),
            text(b.subtitle),
            text(b.description, 8000),
            text(b.location),
            b.start_date,
            b.end_date,
            id,
          ).run();
        } else
          await q(
            'INSERT INTO events(id,title,subtitle,description,location,start_date,end_date,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
            id,
            text(b.title, 100),
            text(b.subtitle) || 'HONEY GOLD CLUB',
            text(b.description, 8000),
            text(b.location),
            b.start_date,
            b.end_date,
            'draft',
            now(),
          ).run();
        if (Object.keys(media).length) {
          const keys = Object.keys(media);
          await q('UPDATE events SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?', ...keys.map(k=>media[k]),id).run();
        }
        return response({ id });
      }
      if (path === 'admin/events/delete' && method === 'POST') {
        const id=text(b.id,100);
        assert(await one('SELECT id FROM events WHERE id=?',id),'活动不存在',404);
        assert(!(await one('SELECT id FROM bookings WHERE event_id=? LIMIT 1',id)),'此活动已有预约记录，不能删除；可下架或结束活动');
        const config=await one("SELECT payload FROM content_settings WHERE id='home'");
        if(config){const content=JSON.parse(config.payload);assert(content.splash?.eventId!==id && !(content.slides||[]).some((s:any)=>s.eventId===id),'此活动被开屏或轮播关联，请先解除关联');}
        const result=await db().batch([
          q('DELETE FROM slots WHERE event_id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE event_id=?)',id,id),
          q('DELETE FROM experiences WHERE event_id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE event_id=?)',id,id),
          q('DELETE FROM events WHERE id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE event_id=?)',id,id),
        ]);
        assert(result[2].meta.changes===1,'此活动已有预约记录，不能删除');
        return response({ok:true});
      }
      if (path === 'admin/event-status' && method === 'POST') {
        assert(['published', 'draft', 'ended'].includes(b.status), '无效状态');
        const e = await one('SELECT id FROM events WHERE id=?', b.id);
        assert(e, '活动不存在', 404);
        if (b.status === 'published')
          assert(
            await one('SELECT id FROM slots WHERE event_id=?', b.id),
            '请先配置至少一个场次',
          );
        await q('UPDATE events SET status=? WHERE id=?', b.status, b.id).run();
        return response({ ok: true });
      }
      if (path === 'admin/slots/delete' && method === 'POST') {
        assert(await one('SELECT id FROM slots WHERE id=?', b.id), '场次不存在', 404);
        const result = await q('DELETE FROM slots WHERE id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=?)', b.id,b.id).run();
        assert(result.meta.changes === 1, '此场次已有预约记录，不能删除');
        return response({ok:true});
      }
      if (path === 'admin/slots/batch' && method === 'POST') {
        const event=await one('SELECT * FROM events WHERE id=?',b.eventId);
        assert(event && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.date>=event.start_date && b.date<=event.end_date,'场次日期需在活动日期内');
        assert(await validSlotExperience(b.eventId,b.experience),'请选择本活动已启用的体验');
        assert(Number.isInteger(b.capacity)&&b.capacity>=1&&b.capacity<=10000,'每场名额须为1至10000的整数');
        let times:string[];try{times=generateSlotTimes(b.startTime,b.endTime,b.interval)}catch(e:any){throw new ApiError(e.message)}
        const results=await db().batch(times.map(time=>q('INSERT INTO slots(id,event_id,experience,date,time,capacity) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM slots WHERE event_id=? AND experience=? AND date=? AND time=?)',uuid(),b.eventId,b.experience,b.date,time,b.capacity,b.eventId,b.experience,b.date,time)));
        const created=results.reduce((n,r)=>n+(r.meta.changes||0),0);
        return response({ok:true,created,skipped:times.length-created});
      }
      if (path === 'admin/slots' && method === 'POST') {
        assert(
          Number.isInteger(b.capacity) &&
            b.capacity >= 1 &&
            b.capacity <= 10000,
          '名额需为 1–10000 的整数',
        );
        if (b.id) {
          const slot = await one(
            "SELECT s.*,(SELECT COUNT(*) FROM bookings WHERE slot_id=s.id AND status IN ('confirmed','checked')) AS booked FROM slots s WHERE s.id=?",
            b.id,
          );
          assert(slot, '场次不存在', 404);
          assert(b.capacity >= slot.booked, '名额不能低于已预约人数');
          const experience = b.experience ?? slot.experience, date = b.date ?? slot.date, time = b.time ?? slot.time;
          const event = await one('SELECT * FROM events WHERE id=?', slot.event_id);
          assert((experience === slot.experience || await validSlotExperience(slot.event_id,experience)) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time), '请填写正确的体验与时间');
          assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= event.start_date && date <= event.end_date, '场次日期需在活动日期内');
          const changed = experience !== slot.experience || date !== slot.date || time !== slot.time;
          if (changed) {
            assert(!(await one('SELECT id FROM bookings WHERE slot_id=? LIMIT 1', b.id)), '此场次已有预约记录，只能调整名额');
            assert(!(await one('SELECT id FROM slots WHERE event_id=? AND experience=? AND date=? AND time=? AND id<>?',slot.event_id,experience,date,time,b.id)), '该场次已存在');
            const updated = await q('UPDATE slots SET experience=?,date=?,time=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=?)',experience,date,time,b.id,b.id).run();
            assert(updated.meta.changes === 1, '此场次已有预约记录，只能调整名额');
          }

          const stmts = [
            q(
              "UPDATE slots SET capacity=? WHERE id=? AND ? >= (SELECT COUNT(*) FROM bookings WHERE slot_id=? AND status IN ('confirmed','checked'))",
              b.capacity,
              b.id,
              b.capacity,
              b.id,
            ),
          ];
          stmts.push(
            q(
              "UPDATE bookings SET status='confirmed' WHERE id IN (SELECT id FROM bookings WHERE slot_id=? AND status='waitlisted' ORDER BY created_at,id LIMIT MAX(0,(SELECT capacity FROM slots WHERE id=?)-(SELECT COUNT(*) FROM bookings WHERE slot_id=? AND status IN ('confirmed','checked'))))",
              b.id,
              b.id,
              b.id,
            ),
          );
          await db().batch(stmts);
          await flushNotices();
        } else {
          const e = await one('SELECT * FROM events WHERE id=?', b.eventId);
          assert(
            e && b.date >= e.start_date && b.date <= e.end_date,
            '场次日期需在活动日期内',
          );
          assert(
            (await validSlotExperience(b.eventId,b.experience)) &&
              /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time),
            '请填写正确的体验与时间',
          );
          assert(
            !(await one(
              'SELECT id FROM slots WHERE event_id=? AND experience=? AND date=? AND time=?',
              b.eventId,
              b.experience,
              b.date,
              b.time,
            )),
            '该场次已存在',
          );
          await q(
            'INSERT INTO slots VALUES(?,?,?,?,?,?)',
            uuid(),
            b.eventId,
            b.experience,
            b.date,
            b.time,
            b.capacity,
          ).run();
        }
        return response({ ok: true });
      }
      if (path === 'admin/checkin' && method === 'POST') {
        const code = text(b.code, 100).replace(/^HG:/, '');
        assert(code, '请输入入场码');
        const booking = await one(joined + ' WHERE b.code=?', code);
        assert(booking, '入场凭证不存在', 404);
        if (booking.status === 'checked') return response({ ...booking, alreadyChecked: true });
        assert(
          booking.status === 'confirmed',
          booking.status === 'checked'
            ? '该凭证已核销，请勿重复操作'
            : '该预约尚未确认或已取消',
        );
        const checkedAt = now();
        const result = await q(
          "UPDATE bookings SET status='checked',checked_at=? WHERE id=? AND status='confirmed'",
          checkedAt,
          booking.id,
        ).run();
        if (result.meta.changes !== 1) {
          const current = await one(joined + ' WHERE b.id=?', booking.id);
          if (current?.status === 'checked') return response({ ...current, alreadyChecked: true });
          throw new ApiError('预约状态已变化，请重新扫码', 409);
        }
        return response({ ...booking, status: 'checked', checked_at: checkedAt, alreadyChecked: false });
      }
    }
    throw new ApiError('接口不存在', 404);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed: bookings.user_id'))
      return response(
        { error: '每场活动仅可预约一种体验，请先取消原预约' },
        409,
      );
    if (e.message?.includes('SLOT_FULL'))
      return response({ error: '场次名额已变化，请刷新后重试' }, 409);
    if (e instanceof ApiError) return response({ error: e.message }, e.status);
    console.error('API failure', e.message);
    return response({ error: '服务暂时不可用，请稍后重试' }, 500);
  }
}
function response(body: any, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
