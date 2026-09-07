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
const demo = () => conf.DEMO_MODE === 'true';
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
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
async function seed() {
  if (!demo()) return;
  const id = 'honey-island-2026';
  if (await one('SELECT id FROM events WHERE id=?', id)) return;
  const stmts = [
    q(
      'INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?)',
      id,
      '蜜金 · 海岛漫游记',
      'HONEY GOLD CLUB',
      '十月，HONEY GOLD CLUB 在上海靠岸。我们把海风、日落与金箔带来，邀请你来一场逃离城市的黄金假日。\n\n① 迎宾区 Check-in\n办理入住，领取「岛屿护照」与俱乐部卡套。摄影师将为你拍摄专属「入住明信片」。\n\n② Gold Bar 微醺区\n调酒师现场调制蜜金品牌特调鸡尾酒，每日 14:00–17:00 限时开放，每日 20 杯。\n\n③ Beauty Bar 体验区\n专业美甲师打造蜜金专属金箔海岛美甲，每日限定 10 位，体验约 30 分钟。\n\n④ Product Gallery 产品展示区\n以「酒店精品陈列室」为灵感，海岛系列产品沉浸式陈列。',
      '上海 · 活动地址待确认',
      '2026-10-15',
      '2026-10-18',
      'published',
      now(),
    ),
  ];
  for (let day = 15; day <= 18; day++)
    for (let type = 0; type < 3; type++) {
      const times =
        type === 1
          ? ['14:00', '14:30', '15:00', '15:30', '16:00']
          : [
              '10:30',
              '11:00',
              '11:30',
              '12:00',
              '12:30',
              '14:00',
              '14:30',
              '15:00',
            ];
      times.forEach((time, i) =>
        stmts.push(
          q(
            'INSERT OR IGNORE INTO slots VALUES(?,?,?,?,?,?)',
            `${day}-${type}-${i}`,
            id,
            experienceNames[type],
            `2026-10-${day}`,
            time,
            type === 0 ? (i < 2 ? 2 : 1) : type === 1 ? 4 : 20,
          ),
        ),
      );
    }
  await db().batch(stmts);
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
    demo() || !s.user_id.startsWith('demo-'),
    '演示会话已失效，请重新登录',
    401,
  );
  assert(!admin || s.role === 'admin', '没有管理权限', 403);
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
  return { token, role, demo: demo() };
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
const joined = `SELECT b.*,e.title,e.location,s.experience,s.date,s.time FROM bookings b JOIN events e ON b.event_id=e.id JOIN slots s ON b.slot_id=s.id`;
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
    const b: any = method === 'GET' ? {} : await req.json().catch(() => ({}));
    if (path === 'config')
      return response({
        demo: demo(),
        subscriptionTemplateId:
          !demo() && subscriptionReady()
            ? conf.WECHAT_SUBSCRIBE_TEMPLATE_ID
            : '',
      });
    if (path === 'auth/demo' && method === 'POST') {
      assert(demo(), '演示登录已关闭', 403);
      await seed();
      const userId = 'demo-' + uuid();
      if (b.role !== 'admin')
        await q(
          'INSERT INTO users(id,name,created_at) VALUES(?,?,?)',
          userId,
          '演示访客',
          now(),
        ).run();
      return response(
        await issue(userId, b.role === 'admin' ? 'admin' : 'user'),
      );
    }
    if (path === 'auth/admin' && method === 'POST') {
      assert(
        conf.ADMIN_KEY &&
          typeof b.key === 'string' &&
          (await hash(b.key)) === (await hash(conf.ADMIN_KEY)),
        '管理密钥不正确',
        401,
      );
      return response(await issue('admin', 'admin'));
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
      await seed();
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
      if (!demo()) {
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
        uuid(),
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
      assert(subscriptionReady() && !demo(), '订阅服务尚未配置', 503);
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
      await session(req, true);
      if (path === 'admin/notifications' && method === 'POST') {
        await q(
          "UPDATE notifications SET status='pending' WHERE status='failed'",
        ).run();
        await flushNotices();
        return response({ ok: true });
      }
      if (path === 'admin/overview') {
        await seed();
        return response({
          events: await all('SELECT * FROM events ORDER BY created_at DESC'),
          bookings: await all(joined + ' ORDER BY b.created_at DESC'),
          slots: await all(
            `SELECT s.*,e.title,(SELECT COUNT(*) FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('confirmed','checked')) AS booked,(SELECT COUNT(*) FROM bookings b WHERE b.slot_id=s.id AND b.status='waitlisted') AS waiting FROM slots s JOIN events e ON e.id=s.event_id ORDER BY s.date,s.time`,
          ),
          users: await all(
            'SELECT u.id,u.name,u.phone,u.created_at,COUNT(b.id) AS bookings FROM users u LEFT JOIN bookings b ON b.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC',
          ),
          notifications: await all('SELECT * FROM notifications'),
          demo: demo(),
        });
      }
      if (path === 'admin/events' && method === 'POST') {
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
            'INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)',
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
        return response({ id });
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
            experienceNames.includes(b.experience) &&
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
        assert(
          booking.status === 'confirmed',
          booking.status === 'checked'
            ? '该凭证已核销，请勿重复操作'
            : '该预约尚未确认或已取消',
        );
        if (!demo()) {
          const start = upcoming(booking);
          assert(
            Date.now() >= start - 15 * 60000 &&
              Date.now() <= start + 30 * 60000,
            '请在预约开始前 15 分钟至开始后 30 分钟核销',
          );
        }
        const result = await q(
          "UPDATE bookings SET status='checked',checked_at=? WHERE id=? AND status='confirmed'",
          now(),
          booking.id,
        ).run();
        assert(result.meta.changes === 1, '该凭证已核销');
        return response({ ...booking, status: 'checked' });
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
