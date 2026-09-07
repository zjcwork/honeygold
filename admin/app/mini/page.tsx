'use client';
import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Share,
  CalendarDays,
  MapPin,
  UserRound,
  Check,
  ArrowUpRight,
  Ticket,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api, loginDemo, stateLabel } from '@/lib/client';
import './mini.css';
export default function Mini() {
  const [events, setEvents] = useState<any[]>([]),
    [mine, setMine] = useState<any[]>([]),
    [tab, setTab] = useState('events'),
    [filter, setFilter] = useState('all'),
    [event, setEvent] = useState<any>(null),
    [sheet, setSheet] = useState(''),
    [type, setType] = useState(''),
    [date, setDate] = useState(''),
    [slotId, setSlotId] = useState(''),
    [booking, setBooking] = useState<any>(null),
    [ticket, setTicket] = useState<any>(null),
    [changing, setChanging] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [isDemo, setIsDemo] = useState(true);
  useEffect(() => {
    const sharedEvent = new URLSearchParams(location.search).get('event');
    if (sharedEvent) void openEvent(sharedEvent);
    const bookingId = new URLSearchParams(location.search).get('booking');
    if (bookingId)
      api('bookings', undefined, 'user')
        .then((rows: any[]) => {
          const own = rows.find((b) => b.id === bookingId);
          if (own) void showTicket(own);
          else setError('预约不存在，请到我的活动查看');
        })
        .catch((e) => setError(e.message));
    api('events', undefined, 'user')
      .then(setEvents)
      .catch((e) => setError(e.message));
    api('config', undefined, 'user').then((c) => setIsDemo(c.demo));
  }, []);
  async function ensureLogin() {
    if (!localStorage.getItem('hg_user')) {
      if (!isDemo) throw Error('请使用微信小程序完成登录与预约');
      await loginDemo('user');
    }
  }
  async function loadMine() {
    try {
      await ensureLogin();
      setMine(await api('bookings', undefined, 'user'));
      setTab('mine');
      setEvent(null);
      setBooking(null);
      setFilter('all');
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function openEvent(id: string) {
    try {
      const e = await api('events/' + id, undefined, 'user');
      setEvent(e);
      setType(e.slots[0]?.experience || '');
      setDate(e.slots[0]?.date || '');
      setSlotId('');
      setBooking(null);
      setTicket(null);
      setChanging(false);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function showTicket(b: any) {
    setBooking(b);
    setEvent(null);
    setTicket(null);
    if (['confirmed', 'checked'].includes(b.status)) {
      try {
        setTicket(await api('bookings/' + b.id + '/ticket', undefined, 'user'));
      } catch (e: any) {
        setError(e.message);
      }
    }
  }
  async function shareEvent() {
    if (!event) return;
    const url = new URL('/mini', location.origin);
    url.searchParams.set('event', event.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url: url.href });
      } else {
        await navigator.clipboard.writeText(url.href);
        window.alert('活动链接已复制，可以粘贴分享给好友。');
      }
    } catch (e: any) {
      if (e.name !== 'AbortError')
        setError('分享失败，请重试或复制浏览器中的活动链接。');
    }
  }
  async function startBooking() {
    try {
      await ensureLogin();
      setSheet('slots');
      setSlotId('');
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      const b = await api(`bookings/${booking.id}/cancel`, {}, 'user');
      setBooking(b);
      setTicket(null);
      setSheet('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function change() {
    try {
      const e = await api('events/' + booking.event_id, undefined, 'user');
      setEvent(e);
      setType(booking.experience);
      setDate(booking.date);
      setSlotId('');
      setChanging(true);
      setSheet('slots');
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function confirmSlot() {
    if (!slotId) {
      setError('请选择预约时间');
      return;
    }
    if (!changing) {
      window.location.assign(
        '/mini/register?event=' +
          encodeURIComponent(event.id) +
          '&slot=' +
          encodeURIComponent(slotId),
      );
      return;
    }
    setBusy(true);
    try {
      const b = await api(
        'bookings/' + booking.id + '/reschedule',
        { slotId },
        'user',
      );
      setSheet('');
      setChanging(false);
      await showTicket(b);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const slots =
    event?.slots?.filter(
      (s: any) => s.experience === type && s.date === date,
    ) || [];
  const selected = event?.slots?.find((s: any) => s.id === slotId);
  function saveTicket() {
    if (!ticket) return;
    const c = document.createElement('canvas');
    c.width = 750;
    c.height = 1050;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#faf8f1';
    ctx.fillRect(0, 0, 750, 1050);
    ctx.fillStyle = '#194d3d';
    ctx.textAlign = 'center';
    ctx.font = '28px Georgia';
    ctx.fillText('HONEY GOLD CLUB', 375, 95);
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(booking.title, 375, 160);
    const qr = ticket.qr;
    const cell = Math.floor(360 / (qr.size + 8));
    const width = (qr.size + 8) * cell;
    const x = (750 - width) / 2;
    ctx.fillStyle = 'white';
    ctx.fillRect(x, 235, width, width);
    ctx.fillStyle = '#163b30';
    qr.data.forEach((v: number, i: number) => {
      if (v)
        ctx.fillRect(
          x + ((i % qr.size) + 4) * cell,
          235 + (Math.floor(i / qr.size) + 4) * cell,
          cell,
          cell,
        );
    });
    ctx.font = '26px sans-serif';
    ctx.fillText(booking.experience, 375, 680);
    ctx.fillText(booking.date + '  ' + booking.time, 375, 740);
    ctx.font = '22px sans-serif';
    ctx.fillText(booking.location, 375, 800);
    ctx.fillText(
      booking.name +
        ' · ' +
        booking.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
      375,
      855,
    );
    ctx.font = '20px sans-serif';
    ctx.fillText('请提前 15 分钟到场 · 出示此码核销', 375, 965);
    const a = document.createElement('a');
    a.download = '蜜金活动入场凭证.png';
    a.href = c.toDataURL();
    a.click();
  }
  return (
    <div className="mini-stage">
      <aside className="mini-intro">
        <a href="/">← 返回管理后台</a>
        <div className="brand">
          honey<span>gold</span>
        </div>
        <div className="mini-intro-title">
          一场海岛漫游，
          <br />
          一次美好相遇。
        </div>
        <p>
          HONEY GOLD CLUB
          <br />
          蜜金活动预约
        </p>
        <div className="preview-note">
          小程序交互预览
          {isDemo && (
            <small>
              演示预约与后台实时联动
              <br />
              请使用测试信息体验
            </small>
          )}
        </div>
      </aside>
      <main className="phone">
        <div className="wechat-top unified-navigation">
          {(event || booking) && (
            <button
              className="navigation-back"
              aria-label="返回"
              onClick={() => {
                if (booking) void loadMine();
                else {
                  setEvent(null);
                  setTab('events');
                }
              }}
            >
              <ChevronLeft size={26} strokeWidth={1.8} />
            </button>
          )}
          <b>
            {booking
              ? '预约详情'
              : event
                ? '活动详情'
                : tab === 'mine'
                  ? '我的活动'
                  : '蜜金 HONEY GOLD'}
          </b>
          <span>•••　◉</span>
        </div>
        <div className="mini-scroll">
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => setError('')}>×</button>
            </div>
          )}
          {!event && !booking && tab === 'events' && (
            <>
              <div className="mini-hero">
                <div>
                  HONEY GOLD
                  <br />
                  CLUB
                </div>
                <span>蜜金 · 海岛漫游记</span>
                <h1>
                  把日常留在岸上
                  <br />
                  向美好出发。
                </h1>
                <small>SHANGHAI · 15—18 OCTOBER 2026</small>
              </div>
              <div className="mini-tabs">
                {[
                  ['all', '全部活动'],
                  ['published', '进行中'],
                  ['ended', '已结束'],
                ].map(([v, t]) => (
                  <button
                    key={v}
                    className={filter === v ? 'on' : ''}
                    onClick={() => setFilter(v)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="mini-list">
                {events
                  .filter((e) => filter === 'all' || e.status === filter)
                  .map((e) => (
                    <button
                      className="mini-event"
                      key={e.id}
                      onClick={() => openEvent(e.id)}
                    >
                      <div className="mini-cover">
                        <small>
                          HONEY
                          <br />
                          GOLD CLUB
                        </small>
                        <b>
                          海岛
                          <br />
                          漫游记
                        </b>
                        <span>蜜金</span>
                      </div>
                      <div>
                        <small>{e.subtitle}</small>
                        <h2>{e.title}</h2>
                        <p>{e.description.slice(0, 52)}…</p>
                        <label>
                          <CalendarDays size={13} />
                          {e.start_date} — {e.end_date.slice(5)}
                        </label>
                        <label>
                          <MapPin size={13} />
                          {e.location}
                        </label>
                        <span className="status">{stateLabel(e.status)} →</span>
                      </div>
                    </button>
                  ))}
                {!events.filter((e) => filter === 'all' || e.status === filter)
                  .length && <div className="empty">暂无相关活动</div>}
              </div>
            </>
          )}
          {tab === 'mine' && !event && !booking && (
            <div className="my-page">
              <div className="eyebrow">MY ISLAND MOMENTS</div>
              <h1>我的活动</h1>
              <p>收藏每一次与蜜金的相遇。</p>
              <div className="mini-tabs">
                {[
                  ['all', '全部'],
                  ['confirmed', '进行中'],
                  ['waitlisted', '候补中'],
                  ['cancelled', '已取消'],
                  ['checked', '已核销'],
                ].map(([v, t]) => (
                  <button
                    key={v}
                    className={filter === v ? 'on' : ''}
                    onClick={() => setFilter(v)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {mine
                .filter((b) => filter === 'all' || b.status === filter)
                .map((b) => (
                  <button
                    className="my-booking"
                    key={b.id}
                    onClick={() => showTicket(b)}
                  >
                    <span className="status">{stateLabel(b.status)}</span>
                    <h2>{b.title}</h2>
                    <p>{b.experience}</p>
                    <label>
                      {b.date} · {b.time}
                    </label>
                    <span className="my-arrow">查看预约 →</span>
                  </button>
                ))}
              {!mine.filter((b) => filter === 'all' || b.status === filter)
                .length && (
                <div className="empty">
                  <Ticket />
                  <h3>还没有相关活动</h3>
                  <p>下一场美好，等你登岛。</p>
                  <Button
                    onClick={() => {
                      setTab('events');
                      setFilter('all');
                    }}
                  >
                    去看看活动
                  </Button>
                </div>
              )}
            </div>
          )}
          {event && !booking && (
            <>
              <div className="detail-hero">
                <small>HONEY GOLD CLUB</small>
                <h1>{event.title.replace(' · ', '\n')}</h1>
                <span>一场逃离城市的黄金假日</span>
              </div>
              <div className="detail-content">
                <span className="status">{stateLabel(event.status)}</span>
                <h1>{event.title}</h1>
                <p className="detail-meta">
                  <CalendarDays size={15} />
                  {event.start_date} 至 {event.end_date}
                </p>
                <p className="detail-meta">
                  <MapPin size={15} />
                  {event.location}
                </p>
                <h2>活动介绍</h2>
                <p className="description">{event.description}</p>
                <h2>活动须知</h2>
                <p className="description">
                  每场活动仅可预约一种体验。满额可提交候补，释放名额后按报名顺序递补。\n请提前
                  8 小时以上修改或取消预约。请于预约时间前 15
                  分钟到场。活动预约免费。
                </p>
              </div>
              <div className="bottom-action">
                <Button
                  className="share-button"
                  aria-label="分享活动"
                  onClick={shareEvent}
                >
                  <Share size={29} strokeWidth={1} />
                </Button>
                <Button
                  className="reserve-button"
                  disabled={event.status !== 'published'}
                  onClick={startBooking}
                >
                  {event.status === 'published' ? '预约登岛' : '活动已结束'}
                </Button>
              </div>
            </>
          )}
          {booking && (
            <div className="ticket-page">
              <div className="ticket-success">
                <span>
                  {booking.status === 'confirmed' ? <Check /> : <Ticket />}
                </span>
                <h1>
                  {stateLabel(booking.status)}
                  {booking.status === 'confirmed' ? '！' : ''}
                </h1>
                <p>
                  {booking.status === 'waitlisted'
                    ? '名额释放后将按顺序递补，请留意我的活动。'
                    : booking.status === 'cancelled'
                      ? '期待下一次与你相遇。'
                      : '抵达活动现场，请出示专属入场凭证。'}
                </p>
              </div>
              <section className="ticket-card">
                <small>HONEY GOLD CLUB</small>
                <h2>{booking.title}</h2>
                {ticket && (
                  <svg
                    viewBox={`0 0 ${ticket.qr.size + 8} ${ticket.qr.size + 8}`}
                    className="qr"
                    role="img"
                    aria-label="专属入场二维码"
                    shapeRendering="crispEdges"
                  >
                    <rect width="100%" height="100%" fill="white" />
                    {ticket.qr.data.map((v: number, i: number) =>
                      v ? (
                        <rect
                          key={i}
                          x={(i % ticket.qr.size) + 4}
                          y={Math.floor(i / ticket.qr.size) + 4}
                          width="1"
                          height="1"
                          fill="#143c30"
                        />
                      ) : null,
                    )}
                  </svg>
                )}
                <div className="ticket-row">
                  <span>登岛体验</span>
                  <b>{booking.experience}</b>
                </div>
                <div className="ticket-row">
                  <span>预约时间</span>
                  <b>
                    {booking.date} {booking.time}
                  </b>
                </div>
                <div className="ticket-row">
                  <span>活动地点</span>
                  <b>{booking.location}</b>
                </div>
                <div className="ticket-row">
                  <span>嘉宾姓名</span>
                  <b>{booking.name}</b>
                </div>
                <div className="ticket-row">
                  <span>手机号码</span>
                  <b>
                    {booking.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
                  </b>
                </div>
                {ticket && (
                  <button
                    className="copy-code"
                    onClick={() =>
                      navigator.clipboard
                        .writeText('HG:' + booking.code)
                        .then(() => {
                          setSheet('copied');
                        })
                        .catch(() => setError('复制失败，请手动使用入场凭证'))
                    }
                  >
                    复制入场码，体验后台核销
                  </button>
                )}
                {['confirmed', 'waitlisted'].includes(booking.status) && (
                  <div className="ticket-actions">
                    <button onClick={change}>修改场次</button>
                    <button onClick={() => setSheet('cancel')}>取消报名</button>
                  </div>
                )}
              </section>
              {ticket && (
                <Button className="save-ticket" onClick={saveTicket}>
                  保存入场凭证
                </Button>
              )}
              <p className="ticket-note">
                请提前 8 小时修改或取消预约
                <br />
                免费预约 · 从容赴约
              </p>
            </div>
          )}
        </div>
        {!event && !booking && (
          <nav className="mini-bottom">
            <button
              className={tab === 'events' ? 'on' : ''}
              onClick={() => {
                setTab('events');
                setFilter('all');
              }}
            >
              <CalendarDays />
              活动中心
            </button>
            <button className={tab === 'mine' ? 'on' : ''} onClick={loadMine}>
              <UserRound />
              我的活动
            </button>
          </nav>
        )}
      </main>
      <Dialog open={!!sheet} onOpenChange={(o) => !o && !busy && setSheet('')}>
        <DialogContent
          className={`mini-dialog ${sheet === 'slots' ? 'slots-dialog' : ''}`}
          showCloseButton={false}
        >
          <div className="sheet-dialog-header">
            <div className="sheet-dialog-handle" aria-hidden="true" />
            <div className="sheet-dialog-heading">
              <DialogTitle>
                {sheet === 'slots'
                  ? '选择你的登岛方式'
                  : sheet === 'form'
                    ? '填写报名信息'
                    : sheet === 'cancel'
                      ? '取消本次预约？'
                      : sheet === 'terms'
                        ? '预约条款与隐私说明'
                        : sheet === 'copied'
                          ? '入场码已复制'
                          : '预约提示'}
              </DialogTitle>
              <button
                className="sheet-cancel"
                disabled={busy}
                onClick={() => setSheet('')}
              >
                取消
              </button>
            </div>
          </div>
          <DialogDescription>
            {sheet === 'slots'
              ? '*每场活动仅可预约一种体验，如需更换请取消后重新预约。'
              : sheet === 'form'
                ? '填写真实信息，开启你的蜜金海岛之旅。'
                : sheet === 'cancel'
                  ? '取消后名额将释放给候补嘉宾。'
                  : 'HONEY GOLD CLUB'}
          </DialogDescription>
          {error && <div className="alert">{error}</div>}
          {sheet === 'slots' && (
            <>
              <div className="slots-scroll">
                <h3>选择场次</h3>
                <div className="choice-grid">
                  {Array.from(
                    new Set(event.slots.map((s: any) => s.experience)),
                  ).map((t: any) => (
                    <button
                      key={t}
                      className={type === t ? 'selected' : ''}
                      onClick={() => {
                        setType(t);
                        setSlotId('');
                        const first = event.slots.find(
                          (s: any) => s.experience === t,
                        );
                        setDate(first?.date || '');
                      }}
                    >
                      {t.split(' ')[0]}
                      <small className={t === '仅登岛参观' ? 'visit-note' : ''}>
                        {t.split(' ').slice(1).join(' ') ||
                          '自由观展 + 迎宾区护照领取'}
                      </small>
                    </button>
                  ))}
                </div>
                <h3>选择日期</h3>
                <div className="choice-grid">
                  {Array.from(
                    new Set(
                      event.slots
                        .filter((s: any) => s.experience === type)
                        .map((s: any) => s.date),
                    ),
                  ).map((d: any) => (
                    <button
                      key={d}
                      className={date === d ? 'selected' : ''}
                      onClick={() => {
                        setDate(d);
                        setSlotId('');
                      }}
                    >
                      {d.slice(5).replace('-', '月')}日
                    </button>
                  ))}
                </div>
                <h3>选择时间</h3>
                <div className="choice-grid">
                  {slots.map((s: any) => (
                    <button
                      key={s.id}
                      disabled={
                        new Date(`${s.date}T${s.time}:00+08:00`).getTime() <=
                        Date.now()
                      }
                      className={slotId === s.id ? 'selected' : ''}
                      onClick={() => setSlotId(s.id)}
                    >
                      {s.time}
                      {s.booked >= s.capacity && <small>已满 · 可候补</small>}
                    </button>
                  ))}
                </div>
                {!slots.length && <p>此日期暂无场次。</p>}
              </div>
              <div className="slot-footer">
                <Button
                  className="mini-submit"
                  onClick={confirmSlot}
                  disabled={busy || !slotId}
                >
                  {busy
                    ? '提交中…'
                    : selected && selected.booked >= selected.capacity
                      ? '预约已满 / 提交候补'
                      : changing
                        ? '确认改签'
                        : '确认预约'}
                </Button>
              </div>
            </>
          )}
          {sheet === 'cancel' && (
            <div className="actions">
              <Button
                variant="outline"
                onClick={() => setSheet('')}
                disabled={busy}
              >
                保留预约
              </Button>
              <Button onClick={cancel} disabled={busy}>
                确认取消
              </Button>
            </div>
          )}
          {sheet === 'copied' && (
            <>
              <p>回到后台「现场核销」，粘贴入场码即可核验此预约。</p>
              <Button onClick={() => setSheet('')}>知道了</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
