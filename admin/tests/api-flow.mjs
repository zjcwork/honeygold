import assert from 'node:assert/strict';
const base = process.env.TEST_URL || 'http://localhost:3000/api';
async function call(path, body, token) {
  const r = await fetch(base + '/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (token || ''),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const b = await r.json();
  return { status: r.status, ...(Array.isArray(b) ? { items: b } : b) };
}
const admin = await call('auth/demo', { role: 'admin' });
assert.ok(admin.token);
assert.equal(
  (await call('admin/overview')).status,
  401,
  'Admin API must require login',
);
const users = await Promise.all(
  Array.from({ length: 7 }, () => call('auth/demo', { role: 'user' })),
);
assert.equal(
  (await call('admin/overview', undefined, users[0].token)).status,
  403,
  'User token cannot administer',
);
const evt = await call(
  'admin/events',
  {
    title: '自动测试 · 名额联动',
    subtitle: 'QA',
    description: '自动化测试使用，不用于真实预约',
    location: '测试场地',
    start_date: '2027-10-15',
    end_date: '2027-10-16',
  },
  admin.token,
);
assert.equal(evt.status, 200);
for (const time of ['10:30', '11:00'])
  assert.equal(
    (
      await call(
        'admin/slots',
        {
          eventId: evt.id,
          experience: '鎏金美甲 Beauty Bar',
          date: '2027-10-15',
          time,
          capacity: 1,
        },
        admin.token,
      )
    ).status,
    200,
  );
assert.equal(
  (
    await call(
      'admin/event-status',
      { id: evt.id, status: 'published' },
      admin.token,
    )
  ).status,
  200,
);
const event = await call('events/' + evt.id);
const s = event.slots[0],
  target = event.slots[1];
const payload = {
  slotId: s.id,
  name: '测试嘉宾',
  phone: '13800000000',
  gender: '女',
  terms: true,
  photoConsent: false,
};
assert.equal(
  (await call('bookings', { ...payload, phone: 'invalid' }, users[0].token))
    .status,
  400,
);
assert.equal(
  (await call('bookings', { ...payload, terms: false }, users[0].token)).status,
  400,
);
const results = await Promise.all(
  users.slice(0, 5).map((u) => call('bookings', payload, u.token)),
);
assert.equal(
  results.filter((r) => r.status === 'confirmed').length,
  1,
  'Concurrent requests must not oversell',
);
assert.equal(
  results.filter((r) => r.status === 'waitlisted').length,
  4,
  'Full slot must waitlist',
);
const owner = results.findIndex((b) => b.status === 'confirmed');
const first = results[owner];
assert.equal(
  (await call('bookings', payload, users[owner].token)).status,
  409,
  'Duplicate active booking rejected',
);
assert.equal(
  (await call('bookings/' + first.id + '/ticket', undefined, users[6].token))
    .status,
  400,
  'Ticket owner protection',
);
assert.equal(
  (await call('bookings/' + first.id + '/cancel', {}, users[6].token)).status,
  404,
  'Cancellation owner protection',
);
const ticket = await call(
  'bookings/' + first.id + '/ticket',
  undefined,
  users[owner].token,
);
assert.ok(ticket.qr.size > 20);
const moved = await call(
  'bookings/' + first.id + '/reschedule',
  { slotId: target.id },
  users[owner].token,
);
assert.equal(moved.slot_id, target.id);
assert.equal(moved.status, 'confirmed');
let list = (
  await call('admin/overview', undefined, admin.token)
).bookings.filter((b) => b.event_id === evt.id);
assert.equal(
  list.filter((b) => b.status === 'confirmed' && b.slot_id === s.id).length,
  1,
  'Reschedule promotes old slot',
);
assert.equal(
  (await call('admin/slots', { id: s.id, capacity: 0 }, admin.token)).status,
  400,
);
assert.equal(
  (await call('admin/slots', { id: s.id, capacity: 3 }, admin.token)).status,
  200,
);
list = (await call('admin/overview', undefined, admin.token)).bookings.filter(
  (b) => b.event_id === evt.id,
);
assert.equal(
  list.filter((b) => b.status === 'confirmed' && b.slot_id === s.id).length,
  3,
  'Capacity increase promotes waitlist',
);
assert.equal(
  (await call('admin/slots', { id: s.id, capacity: 2 }, admin.token)).status,
  400,
  'Cannot reduce below bookings',
);
assert.equal(
  (await call('admin/checkin', { code: 'HG:' + first.code }, admin.token))
    .status,
  'checked',
);
assert.equal(
  (await call('admin/checkin', { code: 'HG:' + first.code }, admin.token))
    .status,
  400,
  'Double check-in rejected',
);
assert.equal(
  (await call('bookings/' + first.id + '/cancel', {}, users[owner].token))
    .status,
  400,
  'Checked booking cannot cancel',
);
const other = list.find((b) => b.status === 'confirmed' && b.slot_id === s.id);
const otherIdx = results.findIndex((b) => b.id === other.id);
assert.equal(
  (await call('bookings/' + other.id + '/cancel', {}, users[otherIdx].token))
    .status,
  'cancelled',
);
list = (await call('admin/overview', undefined, admin.token)).bookings.filter(
  (b) => b.event_id === evt.id,
);
assert.equal(
  list.filter((b) => b.status === 'confirmed' && b.slot_id === s.id).length,
  3,
  'Cancellation promotes next',
);
await call('admin/event-status', { id: evt.id, status: 'draft' }, admin.token);
assert.equal(
  (await call('bookings', payload, users[6].token)).status,
  400,
  'Unpublished event blocks reservation',
);
// A booking beginning in two hours may be created, but the 8-hour rule blocks changes.
const near = new Date(Date.now() + 2 * 3600000);
const local = new Date(near.getTime() + 8 * 3600000).toISOString();
const nearDate = local.slice(0, 10),
  nearTime = local.slice(11, 16);
const nearEvent = await call(
  'admin/events',
  {
    title: '自动测试 · 八小时规则',
    description: '截止时间测试',
    location: '测试场地',
    start_date: nearDate,
    end_date: nearDate,
  },
  admin.token,
);
await call(
  'admin/slots',
  {
    eventId: nearEvent.id,
    experience: '仅登岛参观',
    date: nearDate,
    time: nearTime,
    capacity: 2,
  },
  admin.token,
);
await call(
  'admin/event-status',
  { id: nearEvent.id, status: 'published' },
  admin.token,
);
const nearSlot = (await call('events/' + nearEvent.id)).slots[0];
const nearBooking = await call(
  'bookings',
  { ...payload, slotId: nearSlot.id },
  users[6].token,
);
assert.equal(nearBooking.status, 'confirmed');
assert.equal(
  (await call('bookings/' + nearBooking.id + '/cancel', {}, users[6].token))
    .status,
  400,
  'Cannot cancel inside eight hours',
);
await call(
  'admin/event-status',
  { id: nearEvent.id, status: 'draft' },
  admin.token,
);
console.log(
  'PASS: authentication, ownership, validation, concurrent capacity, duplicate protection, QR generation, waitlist promotion, rescheduling, capacity edits, single-use check-in, unpublished event',
);
