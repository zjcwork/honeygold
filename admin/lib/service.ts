import { defaultLegal, legalTitles } from './legal';
import {generateSlotTimes,validateSlotTime} from './slot-times';
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
async function validSlotExperience(eventId:string,experience:unknown) {
 return typeof experience==='string' && !!(await one('SELECT x.id FROM experiences x JOIN participation_modes m ON m.id=x.mode_id WHERE x.event_id=? AND x.name=? AND x.enabled=1 AND m.enabled=1',eventId,experience));
}
async function participationModes(eventId?:string) {
 const modes=await all('SELECT * FROM participation_modes'+(eventId?' WHERE event_id=?':'')+' ORDER BY position,id',...(eventId?[eventId]:[]));
 const items=await all('SELECT * FROM experiences'+(eventId?' WHERE event_id=?':'')+' ORDER BY rowid',...(eventId?[eventId]:[]));
 return modes.map(m=>({...m,items:items.filter(x=>x.mode_id===m.id)}));
}
async function modeStatements(eventId:string,input:any) {
 assert(Array.isArray(input)&&input.length>0&&input.length<=10,'请新增1至10种参与方式');
 const previous=await participationModes(eventId), oldItems=previous.flatMap(m=>m.items);
 const usedModes=new Set(),usedItems=new Set(),usedNames=new Set(),usedModeNames=new Set();
 const stmts: D1PreparedStatement[]=[];
 for(let position=0;position<input.length;position++){
  const item=input[position],name=text(item.name,60),kind=item.kind;
  assert(name&&['direct','experiences'].includes(kind)&&!usedModeNames.has(name),'参与方式名称不能为空或重复（最多60字）');usedModeNames.add(name);
  const old=item.id?previous.find(m=>m.id===item.id):null;
  assert(!item.id||old,'参与方式不存在或已更新，请刷新');
  const id=old?.id||uuid();assert(!usedModes.has(id),'参与方式重复');usedModes.add(id);
  if(old&&old.kind!==kind)assert(!(await one('SELECT id FROM slots WHERE mode_id=? LIMIT 1',id)),'已有场次的参与方式不能更改类型');
  stmts.push(old?q('UPDATE participation_modes SET name=?,kind=?,enabled=?,position=? WHERE id=?',name,kind,item.enabled===false||item.enabled===0?0:1,position,id):q('INSERT INTO participation_modes VALUES(?,?,?,?,?,?)',id,eventId,name,kind,item.enabled===false||item.enabled===0?0:1,position));
  const entries=kind==='direct'?(old?.kind==='direct'?old.items.map((x:any)=>({...x,name:x.name})): [{name}]):item.items;
  assert(Array.isArray(entries)&&entries.length>0&&entries.length<=20,'每种体验方式请新增1至20个体验项目');
  for(const entry of entries){
   const prior=entry.id?oldItems.find(x=>x.id===entry.id):null;
   assert(!entry.id||prior,'体验不存在或已更新，请刷新');
   const eid=prior?.id||uuid(),ename=kind==='direct'&&prior?prior.name:text(entry.name,80);
   assert((ename||kind==='direct')&&!usedNames.has(ename)&&!usedItems.has(eid),'体验名称不能为空或重复（最多80字，同一活动内不能重名）');
   assert(!prior||prior.mode_id===id,'请勿移动已有体验；可新建体验');
   assert(!oldItems.some(x=>x.name===ename&&x.id!==eid),'此体验名称已被使用');
   usedNames.add(ename);usedItems.add(eid);
   if(prior){stmts.push(q('UPDATE experiences SET name=?,enabled=? WHERE id=?',ename,entry.enabled===false||entry.enabled===0?0:1,eid));}
   else stmts.push(q('INSERT INTO experiences(id,event_id,name,enabled,mode_id) VALUES(?,?,?,?,?)',eid,eventId,ename,1,id));
  }
 }
 assert(input.some((m:any)=>m.enabled!==false&&m.enabled!==0),'至少启用一种参与方式');
 for(const old of oldItems)if(!usedItems.has(old.id)){
  assert(!(await one('SELECT id FROM slots WHERE experience_id=? LIMIT 1',old.id)),'该体验已有场次，不能删除，可停用');
  assert(!(await one('SELECT id FROM bookings WHERE event_id=? AND EXISTS(SELECT 1 FROM json_each(experience_ids) WHERE value=?) LIMIT 1',eventId,old.id)),'已有预约选择此体验，不能删除，可停用');
  stmts.push(q('DELETE FROM experiences WHERE id=?',old.id));
 }
 for(const old of previous)if(!usedModes.has(old.id)){assert(!(await one('SELECT id FROM slots WHERE mode_id=? LIMIT 1',old.id)),'该参与方式已有场次，不能删除，可停用');stmts.push(q('DELETE FROM participation_modes WHERE id=?',old.id));}
 return stmts;
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
const joined = `SELECT b.*,c.code AS code,e.title,e.subtitle,e.hero_image,e.cover_image,e.summary,e.description,e.notices,e.contact_wechat,e.contact_qr,e.location,s.date,s.time,m.id AS participation_mode_id,m.kind AS participation_kind,m.name AS participation_name,m.name AS experience,(SELECT json_group_array(json_object('id',x.id,'name',x.name)) FROM json_each(b.experience_ids) selected JOIN experiences x ON x.id=selected.value) AS experience_items,CASE WHEN m.kind='direct' THEN m.name ELSE COALESCE((SELECT group_concat(x.name,'、') FROM experiences x WHERE x.id IN (SELECT value FROM json_each(b.experience_ids))),m.name) END AS experience_label FROM (SELECT * FROM bookings WHERE superseded=0) b JOIN booking_credentials c ON c.group_key=COALESCE(b.booking_group_id,b.id) JOIN events e ON b.event_id=e.id JOIN slots s ON b.slot_id=s.id JOIN participation_modes m ON m.id=s.mode_id`;
const upcoming = (s: any) => new Date(`${s.date}T${s.time.split('-')[0]}:00+08:00`).getTime();

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
        `SELECT s.*,(SELECT COUNT(DISTINCT user_id) FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('confirmed','checked')) AS booked,0 AS waiting FROM slots s WHERE event_id=? ORDER BY date,time`,
        e.id,
      );
      const modes=await participationModes(e.id);
      const available=modes.filter(m=>m.enabled).map(m=>({...m,items:m.items.filter((x:any)=>x.enabled)}));
      return response({...e,participation_modes:available,slots:slots.flatMap(slot=>{const mode=available.find(m=>m.id===slot.mode_id);return mode&&(mode.kind==='direct'||slot.experience_id)?[{...slot,mode_id:mode.id,mode_kind:mode.kind,mode_name:mode.name,experience_label:mode.name}]:[]})});
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
      const gender=b.gender??'',birthday=b.birthday??'';
      assert(['女','男','不便透露'].includes(gender),'请选择性别');
      assert(typeof birthday==='string'&&birthday.length>0,'请选择生日');
      assert(typeof birthday==='string'&&(/^\d{4}-\d{2}-\d{2}$/.test(birthday)&&Number.isFinite(Date.parse(birthday+'T00:00:00Z'))&&new Date(birthday+'T00:00:00Z').toISOString().slice(0,10)===birthday&&birthday<=(new Date(Date.now()+8*3600000).toISOString().slice(0,10))),'请填写有效生日，不能晚于今天');
      assert(b.terms === true, '请阅读并同意预约条款');
      const selections=b.selections??[{slotId:b.slotId||(Array.isArray(b.slotIds)&&b.slotIds.length===1?b.slotIds[0]:null),experienceIds:b.experienceIds||[]}];
      assert(Array.isArray(selections)&&selections.length>0&&selections.length<=20,'请选择体验和时间');
      const groups=new Map<string,{slot:any;experienceIds:string[]}>();
      const seen=new Set<string>();let first:any;
      for(const selection of selections){
        assert(selection&&typeof selection.slotId==='string','请选择场次');
        const slot=await one('SELECT s.*,e.status,m.kind,m.enabled FROM slots s JOIN events e ON e.id=s.event_id JOIN participation_modes m ON m.id=s.mode_id WHERE s.id=?',selection.slotId);
        assert(slot&&slot.status==='published'&&slot.enabled,'该场次未开放预约');
        assert(upcoming(slot)>Date.now(),'该场次已开始');
        if(!first)first=slot;
        assert(slot.event_id===first.event_id&&slot.mode_id===first.mode_id&&slot.date===first.date,'请选择同一参与方式、同一日期的场次');
        const ids=selection.experienceIds;
        assert(Array.isArray(ids)&&ids.length<=20&&ids.every((id:any)=>typeof id==='string'),'体验选择无效');
        assert(slot.kind==='experiences'?ids.length>0:ids.length===0&&selections.length===1,'请按参与方式选择体验');
        for(const id of ids){
          assert(slot.experience_id===id,'该场次不属于所选体验');
          assert(!seen.has(id),'每个体验只能选择一个时间');seen.add(id);
          assert(await one('SELECT id FROM experiences WHERE id=? AND mode_id=? AND enabled=1',id,slot.mode_id),'请选择本参与方式已启用的体验');
        }
        assert(seen.size<=20,'最多选择20个体验');
        const group=groups.get(slot.id)||{slot,experienceIds:[]};group.experienceIds.push(...ids);groups.set(slot.id,group);
      }
      const u=await one('SELECT phone FROM users WHERE id=?',s.user_id);assert(u?.phone===b.phone,'请先授权验证手机号',403);
      assert(!(await one("SELECT id FROM bookings WHERE event_id=? AND user_id=? AND status!='cancelled' LIMIT 1",first.event_id,s.user_id)),'该活动已有预约，请先查看或取消已有预约',409);
      const groupId=uuid(),ids:string[]=[];
      const statements=[...groups.values()].map(({slot,experienceIds})=>{
        const id=uuid();ids.push(id);
        return q(`INSERT INTO bookings(id,event_id,slot_id,user_id,name,phone,gender,status,photo_consent,terms_version,code,created_at,experience_ids,booking_group_id,birthday) VALUES(?,?,?,?,?,?,?,'confirmed',?,?,?,?,?,?,?)`,id,slot.event_id,slot.id,s.user_id,text(b.name,40),b.phone,gender,b.photoConsent?1:0,'2026-09-10',`${Date.now()}-${uuid()}`,now(),JSON.stringify(experienceIds),groupId,birthday);
      });
      await db().batch([...statements,q('UPDATE users SET name=?,phone=? WHERE id=?',text(b.name,40),b.phone,s.user_id)]);
      const reservations=await Promise.all(ids.map(id=>one(joined+' WHERE b.id=?',id)));
      return response({...reservations[0],reservations});
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
        booking && ['confirmed'].includes(booking.status),
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
        ['confirmed'].includes(booking.status),
        '此预约不能修改',
      );
      assert(
        upcoming(booking) - Date.now() >= 8 * 3600000,
        '距预约时间不足 8 小时，无法修改或取消',
      );
      if (action === 'cancel') {
        const related=booking.booking_group_id
          ?await all(joined+' WHERE b.booking_group_id=? AND b.user_id=? AND b.event_id=?',booking.booking_group_id,s.user_id,booking.event_id)
          :[booking];
        assert(!related.some((item:any)=>item.status==='checked'),'本次活动已有体验核销，无法整单取消');
        const active=related.filter((item:any)=>['confirmed'].includes(item.status));
        assert(active.every((item:any)=>upcoming(item)-Date.now()>=8*3600000),'本次活动有场次距开始不足 8 小时，无法整单取消');
        const ids=related.map((item:any)=>item.id),placeholders=ids.map(()=>'?').join(',');
        const result=await db().batch([
          q(`UPDATE bookings SET status='cancelled' WHERE id IN (${placeholders}) AND status IN ('confirmed') AND NOT EXISTS(SELECT 1 FROM bookings WHERE id IN (${placeholders}) AND status='checked')`,...ids,...ids),
        ]);
        assert(result[0].meta.changes===active.length,'预约状态已变化，请刷新后重试',409);
      } else {
        const related=booking.booking_group_id?await all(joined+' WHERE b.booking_group_id=? AND b.user_id=? AND b.event_id=?',booking.booking_group_id,s.user_id,booking.event_id):[booking];
        assert(related.every((item:any)=>['confirmed'].includes(item.status)&&upcoming(item)-Date.now()>=8*3600000),'本次预约有场次已核销、取消或距开始不足 8 小时，无法整单修改');
        const selections=b.selections;
        assert(Array.isArray(selections)&&selections.length>0&&selections.length<=20,'请提交整条预约的体验和时间');
        const expected=new Set<string>(related.flatMap((item:any)=>JSON.parse(item.experience_ids||'[]'))),seen=new Set<string>();
        const groups=new Map<string,{slot:any;experienceIds:string[]}>();let date='';
        for(const selection of selections){
          assert(selection&&typeof selection.slotId==='string'&&Array.isArray(selection.experienceIds),'场次选择无效');
          const slot=await one('SELECT s.*,e.status,m.enabled FROM slots s JOIN events e ON e.id=s.event_id JOIN participation_modes m ON m.id=s.mode_id WHERE s.id=?',selection.slotId);
          assert(slot&&slot.event_id===booking.event_id&&slot.mode_id===booking.participation_mode_id&&slot.enabled&&slot.status==='published'&&upcoming(slot)-Date.now()>=8*3600000,'请选择同一参与方式下距当前至少 8 小时的场次');
          assert(!date||date===slot.date,'所有体验请选择同一天');date=slot.date;
          assert(expected.size?selection.experienceIds.length>0:selections.length===1&&selection.experienceIds.length===0,'体验选择无效');
          for(const experienceId of selection.experienceIds){assert(slot.experience_id===experienceId,'该场次不属于所选体验');assert(expected.has(experienceId)&&!seen.has(experienceId),'请完整提交原预约的所有体验，不能重复');seen.add(experienceId)}
          const group=groups.get(slot.id)||{slot,experienceIds:[]};group.experienceIds.push(...selection.experienceIds);groups.set(slot.id,group);
        }
        assert(seen.size===expected.size,'请为原预约的所有体验选择时间');
        assert([...groups.values()].some(g=>!related.some((old:any)=>old.slot_id===g.slot.id&&JSON.stringify(JSON.parse(old.experience_ids).sort())===JSON.stringify([...g.experienceIds].sort())))||groups.size!==related.length,'请选择新的场次');
        const oldIds=related.map((item:any)=>item.id),marks=oldIds.map(()=>'?').join(','),groupId=booking.booking_group_id||uuid(),newIds:string[]=[];
        // The guard causes the whole transaction to roll back if a concurrent check-in or revision changed a source row.
        const statements=[q(`INSERT INTO bookings(id) SELECT ? WHERE (SELECT COUNT(*) FROM bookings WHERE id IN (${marks}) AND status IN ('confirmed') AND superseded=0)!=?`,booking.id,...oldIds,oldIds.length),q(`UPDATE bookings SET status='cancelled',superseded=1 WHERE id IN (${marks})`,...oldIds)];
        for(const {slot,experienceIds} of groups.values()){
          const newId=uuid();newIds.push(newId);
          statements.push(q(`INSERT INTO bookings(id,event_id,slot_id,user_id,name,phone,gender,status,photo_consent,terms_version,code,created_at,experience_ids,booking_group_id,birthday) VALUES(?,?,?,?,?,?,?,'confirmed',?,?,?,?,?,?,?)`,newId,booking.event_id,slot.id,s.user_id,booking.name,booking.phone,booking.gender,booking.photo_consent,booking.terms_version,`${Date.now()}-${uuid()}`,booking.created_at,JSON.stringify(experienceIds),groupId,booking.birthday||''));
        }
        await db().batch(statements);await flushNotices();
        return response(await one(joined+' WHERE b.id=?',newIds[0]));
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
          participation_modes: await participationModes(),
          experiences: await all('SELECT * FROM experiences ORDER BY rowid'),
          events: await all('SELECT * FROM events ORDER BY created_at DESC'),
          bookings: await all(joined + ' ORDER BY b.created_at DESC'),
          slots: await all(
            `SELECT s.*,e.title,(SELECT COUNT(DISTINCT user_id) FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('confirmed','checked')) AS booked,0 AS waiting FROM slots s JOIN events e ON e.id=s.event_id ORDER BY s.date,s.time`,
          ),
          users: await all(
            'SELECT u.id,u.name,u.phone,u.created_at,(SELECT latest.gender FROM bookings latest WHERE latest.user_id=u.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AS gender,(SELECT latest.birthday FROM bookings latest WHERE latest.user_id=u.id AND latest.superseded=0 AND latest.birthday!=\'\' ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AS birthday,COUNT(DISTINCT COALESCE(b.booking_group_id,b.id)) AS bookings FROM users u LEFT JOIN bookings b ON b.user_id=u.id AND b.superseded=0 GROUP BY u.id ORDER BY u.created_at DESC',
          ),
          notifications: await all('SELECT * FROM notifications'),
          demo: false,
        });
      }
      if(path==='admin/participation'&&method==='POST'){
        assert(await one('SELECT id FROM events WHERE id=?',b.eventId),'活动不存在',404);
        await db().batch(await modeStatements(b.eventId,b.modes));return response({ok:true,modes:await participationModes(b.eventId)});
      }
      if (path === 'admin/experiences/delete' && method === 'POST') {
        const item = await one('SELECT * FROM experiences WHERE id=? AND event_id=?',b.id,b.eventId);
        assert(item,'体验不存在',404);
        assert(!(await one('SELECT id FROM slots WHERE experience_id=? LIMIT 1',item.id)),'该体验已有场次，不能删除，可停用');
        const result = await q('DELETE FROM experiences WHERE id=? AND event_id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE event_id=? AND EXISTS(SELECT 1 FROM json_each(experience_ids) WHERE value=?))',b.id,b.eventId,b.eventId,item.id).run();
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
          assert(await one("SELECT id FROM participation_modes WHERE id=? AND kind='experiences'",previous.mode_id),'请在参与方式维护中修改该项目');
          await db().batch([
            q('UPDATE experiences SET name=?,enabled=? WHERE id=?',name,b.enabled?1:0,b.id),
            q('UPDATE slots SET experience=? WHERE experience=? AND event_id=?',name,previous.name,b.eventId),
          ]);
        } else {const mode=await one("SELECT id FROM participation_modes WHERE event_id=? AND kind='experiences' AND enabled=1 ORDER BY position LIMIT 1",b.eventId);assert(mode,'请先新增包含体验的参与方式');await q('INSERT INTO experiences(id,event_id,name,enabled,mode_id) VALUES(?,?,?,?,?)',uuid(),b.eventId,name,b.enabled?1:0,mode.id).run();}
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
        const visitEnabled = b.visit_enabled === undefined ? 1 : Number(b.visit_enabled);
        const experienceEnabled = b.experience_enabled === undefined ? 1 : Number(b.experience_enabled);
        assert([0,1].includes(visitEnabled) && [0,1].includes(experienceEnabled) && (visitEnabled || experienceEnabled),'至少启用一种参与方式');
        const initialExperiences = b.id ? [] : String(b.experience_names||'').split(/\r?\n/).map((v:string)=>v.trim()).filter(Boolean);
        assert(initialExperiences.length<=20 && new Set(initialExperiences).size===initialExperiences.length && initialExperiences.every((v:string)=>v.length<=60 && v!=='仅登岛参观'),'体验名称不能重复，最多20项，每项最多60字');
        const id = b.id || uuid();
        const modeInput=b.participation_modes || (!b.id?[{name:'仅登岛参观',kind:'direct',enabled:!!visitEnabled},...(initialExperiences.length?[{name:'参与体验',kind:'experiences',enabled:!!experienceEnabled,items:initialExperiences.map((name:string)=>({name}))}]:[])]:null);
        const modeChanges=modeInput?await modeStatements(id,modeInput):[];
        const eventChanges:D1PreparedStatement[]=[];
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
          eventChanges.push(q(
            'UPDATE events SET title=?,subtitle=?,description=?,location=?,start_date=?,end_date=? WHERE id=?',
            text(b.title, 100),
            text(b.subtitle),
            text(b.description, 8000),
            text(b.location),
            b.start_date,
            b.end_date,
            id,
          ));
        } else
          eventChanges.push(q(
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
          ));
        if (Object.keys(media).length) {
          const keys = Object.keys(media);
          eventChanges.push(q('UPDATE events SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?', ...keys.map(k=>media[k]),id));
        }
        await db().batch([...eventChanges,q('UPDATE events SET visit_enabled=?,experience_enabled=? WHERE id=?',visitEnabled,experienceEnabled,id),...modeChanges]);
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
          q('DELETE FROM participation_modes WHERE event_id=?',id),
          q('DELETE FROM events WHERE id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE event_id=?)',id,id),
        ]);
        assert(result[3].meta.changes===1,'此活动已有预约记录，不能删除');
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
      if ((path==='admin/slots'||path==='admin/slots/batch')&&method==='POST') {
        const old=b.id?await one("SELECT s.*,(SELECT COUNT(DISTINCT user_id) FROM bookings WHERE slot_id=s.id AND status IN ('confirmed','checked')) booked FROM slots s WHERE id=?",b.id):null;
        assert(!b.id||old,'场次不存在',404);
        const eventId=old?.event_id||b.eventId,modeId=b.modeId||old?.mode_id;
        const mode=await one('SELECT * FROM participation_modes WHERE id=? AND event_id=?',modeId||'',eventId);
        assert(mode&&(mode.enabled||old?.mode_id===modeId),'请选择本活动已启用的参与方式');
        const experienceId=mode.kind==='direct'?null:b.experienceId===undefined?(old?.experience_id||null):(b.experienceId||null);
        assert(mode.kind==='direct'||!!experienceId,'请选择具体体验');
        assert(!experienceId||(mode.kind==='experiences'&&await one('SELECT id FROM experiences WHERE id=? AND mode_id=?',experienceId,modeId)),'请选择本参与方式下的体验');
        const event=await one('SELECT * FROM events WHERE id=?',eventId);
        const date=b.date||old?.date;
        assert(event&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=event.start_date&&date<=event.end_date,'场次日期需在活动日期内');
        assert(Number.isInteger(b.capacity)&&b.capacity>=Math.max(1,old?.booked||0)&&b.capacity<=10000,'名额须为1至10000，且不能低于已预约人数');
        let times:string[];
        if(path==='admin/slots/batch'){assert(!b.id,'编辑场次不支持批量');try{times=generateSlotTimes(b.startTime,b.endTime,b.interval,b.duration)}catch(e:any){throw new ApiError(e.message)}}
        else {const time=b.time||old?.time;try{times=[validateSlotTime(time)]}catch(e:any){throw new ApiError(e.message)}}
        if(old){
          if(experienceId!==(old.experience_id||null)||modeId!==old.mode_id||date!==old.date||times[0]!==old.time){
            assert(!(await one('SELECT id FROM bookings WHERE slot_id=? LIMIT 1',old.id)),'已有预约的场次只能调整名额');
            const changed=await q('UPDATE slots SET mode_id=?,experience_id=?,date=?,time=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=?)',modeId,experienceId,date,times[0],old.id,old.id).run();assert(changed.meta.changes===1,'已有预约的场次只能调整名额');
          }
          await q("UPDATE slots SET capacity=? WHERE id=? AND ?>=(SELECT COUNT(DISTINCT user_id) FROM bookings WHERE slot_id=? AND status IN ('confirmed','checked'))",b.capacity,old.id,b.capacity,old.id).run();await flushNotices();return response({ok:true});
        }
        const result=await db().batch(times.map(time=>q("INSERT INTO slots(id,event_id,experience,date,time,capacity,mode_id,experience_id) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM slots WHERE mode_id=? AND COALESCE(experience_id,'')=COALESCE(?,'') AND date=? AND time=?)",uuid(),eventId,'',date,time,b.capacity,modeId,experienceId,modeId,experienceId,date,time)));
        const created=result.reduce((n,r)=>n+(r.meta.changes||0),0);assert(created||path==='admin/slots/batch','该场次已存在');return response({ok:true,created,skipped:times.length-created});
      }
      if (path === 'admin/checkin' && method === 'POST') {
        const code = text(b.code, 100).replace(/^HG:/, '');
        assert(code, '请输入入场码');
        const items=await all(joined+' WHERE c.code=? ORDER BY s.date,s.time',code);
        assert(items.length,'入场凭证不存在',404);
        assert(items.some((item:any)=>['confirmed','checked'].includes(item.status)),'该预约尚未确认或已取消');
        const checkedAt=now(),ids=items.map((item:any)=>item.id),marks=ids.map(()=>'?').join(',');
        const result=await q(`UPDATE bookings SET status='checked',checked_at=? WHERE id IN (${marks}) AND superseded=0 AND status='confirmed'`,checkedAt,...ids).run();
        const current=await all(joined+' WHERE c.code=? ORDER BY s.date,s.time',code);
        const checked=current.filter((item:any)=>item.status==='checked');
        assert(checked.length,'预约状态已变化，请重新扫码',409);
        return response({...checked[0],experience_label:current.map((item:any)=>(item.experience_label||item.experience)+' · '+item.date+' '+item.time+' · '+(item.status==='checked'?'已核销':'已取消')).join('；'),time:[...new Set(current.map((item:any)=>item.time))].join('、'),reservations:current,alreadyChecked:result.meta.changes===0});
      }
    }
    throw new ApiError('接口不存在', 404);
  } catch (e: any) {
    if (e.message?.includes('BOOKING_CONFLICT') || e.message?.includes('UNIQUE constraint failed: bookings.user_id'))
      return response(
        { error: '该活动已有预约或体验重复，请先查看或取消已有预约' },
        409,
      );
    if(e.message?.includes('UNIQUE constraint failed: slots.mode_id'))return response({error:'该参与方式下的日期和时间已存在'},409);
    if (e.message?.includes('SLOT_FULL'))
      return response({ error: '所选场次名额已满，请选择其他时间' }, 409);
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
