import { env } from 'cloudflare:workers';
const conf = env as any;
const names: any = {
  confirmed: '预约成功',
  checked: '已核销',
  waitlisted: '候补中',
  cancelled: '已取消',
};
const sourceFields = new Set(['title','name','date','datetime','time','experience','status']);
export function subscriptionReady() {
  try {
    const fields = JSON.parse(conf.WECHAT_SUBSCRIBE_FIELDS || '{}');
    return conf.DEMO_MODE !== 'true' && !!conf.WECHAT_APP_ID && !!conf.WECHAT_APP_SECRET &&
      !!conf.WECHAT_SUBSCRIBE_TEMPLATE_ID && !!fields && !Array.isArray(fields) &&
      typeof fields === 'object' && Object.keys(fields).length > 0 &&
      Object.entries(fields).every(([key, field]) => /^[a-z]+[1-9]\d*$/.test(key) && typeof field === 'string' && sourceFields.has(field));
  } catch {
    return false;
  }
}
// Single pending grant per booking. Never retry an ambiguous 'sending' state automatically.
export async function flushNotices(bookingId?: string) {
  if (conf.DEMO_MODE === 'true' || !subscriptionReady()) return;
  const db = conf.DB as D1Database;
  const list = (
    await db
      .prepare(
        `SELECT n.booking_id,b.status AS booking_status,b.name,b.phone,e.title,s.date,s.time,COALESCE((SELECT group_concat(x.name,'、') FROM experiences x WHERE x.id IN (SELECT value FROM json_each(b.experience_ids))),(SELECT name FROM participation_modes WHERE id=s.mode_id)) AS experience,u.openid FROM notifications n JOIN bookings b ON b.id=n.booking_id JOIN users u ON u.id=b.user_id JOIN events e ON e.id=b.event_id JOIN slots s ON s.id=b.slot_id WHERE n.status='pending' AND b.status IN ('confirmed','cancelled') AND (? IS NULL OR n.booking_id=?) ORDER BY n.updated_at LIMIT 20`,
      )
      .bind(bookingId || null, bookingId || null)
      .all()
  ).results as any[];
  if (!list.length) return;
  let token: string;
  try {
    const t: any = await (
      await fetch(
        'https://api.weixin.qq.com/cgi-bin/token?' +
          new URLSearchParams({
            grant_type: 'client_credential',
            appid: conf.WECHAT_APP_ID,
            secret: conf.WECHAT_APP_SECRET,
          }),
        { signal: AbortSignal.timeout(5000) },
      )
    ).json();
    if (!t.access_token) throw Error('微信 access_token 获取失败');
    token = t.access_token;
  } catch {
    return;
  }
  for (const row of list) {
    const claimed = await db
      .prepare(
        "UPDATE notifications SET status='sending',updated_at=? WHERE booking_id=? AND status='pending'",
      )
      .bind(new Date().toISOString(), row.booking_id)
      .run();
    if (claimed.meta.changes !== 1) continue;
    try {
      const fields = JSON.parse(conf.WECHAT_SUBSCRIBE_FIELDS);
      const source: any = {
        title: row.title,
        name: row.name,
        date: row.date,
        datetime: row.date + ' ' + String(row.time).split('-')[0],
        time: row.time,
        experience: row.experience,
        status: names[row.booking_status],
      };
      const data: any = {};
      for (const [key, field] of Object.entries(fields)) {
        if (typeof field !== 'string' || !(field in source))
          throw Error('订阅模板字段配置无效');
        data[key] = {
          value: key.startsWith('thing')
            ? Array.from(String(source[field] || '')).slice(0, 20).join('')
            : String(source[field]),
        };
      }
      const response: any = await (
        await fetch(
          'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' +
            token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({
              touser: row.openid,
              template_id: conf.WECHAT_SUBSCRIBE_TEMPLATE_ID,
              page: 'pages/index/index?booking=' + encodeURIComponent(row.booking_id),
              miniprogram_state: ['developer','trial','formal'].includes(conf.WECHAT_SUBSCRIBE_STATE) ? conf.WECHAT_SUBSCRIBE_STATE : 'formal',
              data,
            }),
          },
        )
      ).json();
      if (!Number.isInteger(response.errcode)) throw Error('微信返回结果无效');
      await db
        .prepare(
          'UPDATE notifications SET status=?,last_error=?,updated_at=? WHERE booking_id=?',
        )
        .bind(
          response.errcode === 0 ? 'sent' : 'failed',
          response.errcode === 0
            ? null
            : `微信错误 ${response.errcode}: ${response.errmsg || ''}`,
          new Date().toISOString(),
          row.booking_id,
        )
        .run();
    } catch {
      await db
        .prepare(
          "UPDATE notifications SET status='unknown',last_error='发送结果不确定，请人工核对微信记录后处理',updated_at=? WHERE booking_id=?",
        )
        .bind(new Date().toISOString(), row.booking_id)
        .run();
    }
  }
}
