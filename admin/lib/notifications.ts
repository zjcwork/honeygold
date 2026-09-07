import { env } from 'cloudflare:workers';
const conf = env as any;
const names: any = {
  confirmed: '预约成功',
  checked: '已核销',
  waitlisted: '候补中',
  cancelled: '已取消',
};
export function subscriptionReady() {
  try {
    return (
      !!conf.WECHAT_SUBSCRIBE_TEMPLATE_ID &&
      Object.keys(JSON.parse(conf.WECHAT_SUBSCRIBE_FIELDS || '{}')).length > 0
    );
  } catch {
    return false;
  }
}
// Single pending grant per booking. Never retry an ambiguous 'sending' state automatically.
export async function flushNotices() {
  if (conf.DEMO_MODE === 'true' || !subscriptionReady()) return;
  const db = conf.DB as D1Database;
  const list = (
    await db
      .prepare(
        `SELECT n.booking_id,b.status AS booking_status,b.name,b.phone,b.code,e.title,s.date,s.time,s.experience,u.openid FROM notifications n JOIN bookings b ON b.id=n.booking_id JOIN users u ON u.id=b.user_id JOIN events e ON e.id=b.event_id JOIN slots s ON s.id=b.slot_id WHERE n.status='pending' AND b.status IN ('confirmed','cancelled') LIMIT 20`,
      )
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
        datetime: row.date + ' ' + row.time,
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
            ? String(source[field]).slice(0, 20)
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
            body: JSON.stringify({
              touser: row.openid,
              template_id: conf.WECHAT_SUBSCRIBE_TEMPLATE_ID,
              page: 'pages/index/index',
              data,
            }),
          },
        )
      ).json();
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
