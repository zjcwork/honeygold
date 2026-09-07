'use client';
import {
  CalendarDays,
  ScanLine,
  Calendar,
  Ticket,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookingTable, Badge } from './page';
export default function Dashboard({ data, navigate }: any) {
  const event =
    data.events.find((e: any) => e.status === 'published') || data.events[0];
  return (
    <div className="dashboard-grid">
      <section className="panel featured">
        <div className="panel-title">
          <h2>
            正在筹备的活动 <span>{data.events.length}</span>
          </h2>
          <Button variant="ghost" onClick={() => navigate('活动管理')}>
            全部活动
            <ArrowRight />
          </Button>
        </div>
        {event ? (
          <div className="feature-body">
            <div className="event-poster">
              <div>
                HONEY GOLD
                <br />
                CLUB
              </div>
              <span>蜜金</span>
              <strong>
                海岛
                <br />
                漫游记
              </strong>
              <small>SHANGHAI · OCTOBER 2026</small>
            </div>
            <div className="feature-copy">
              <div style={{ position: 'absolute', right: 0, top: 0 }}>
                <Badge value={event.status} />
              </div>
              <div className="eyebrow">HONEY GOLD CLUB</div>
              <h2>{event.title}</h2>
              <p>{event.description.slice(0, 48)}…</p>
              <div className="event-meta">
                <CalendarDays size={16} />
                {event.start_date} – {event.end_date.slice(5)}
              </div>
              <div className="event-meta">⌖ {event.location}</div>
              <div className="feature-footer">
                <span>
                  {
                    new Set(
                      data.slots
                        .filter((s: any) => s.event_id === event.id)
                        .map((s: any) => s.experience),
                    ).size
                  }{' '}
                  种登岛体验
                </span>
                <Button variant="outline" onClick={() => navigate('活动管理')}>
                  管理活动
                  <ArrowUpRight />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">暂无活动，请先创建活动。</div>
        )}
      </section>
      <section className="panel quick">
        <div className="panel-title">
          <h2>快捷操作</h2>
          <span className="muted">QUICK ACCESS</span>
        </div>
        {[
          [ScanLine, '现场核销', '扫描入场凭证，轻松签到'],
          [Calendar, '场次管理', '安排时间，掌握体验名额'],
          [Ticket, '预约名单', '查看报名与候补记录'],
        ].map(([Icon, title, sub]: any) => (
          <button
            key={title}
            onClick={() =>
              navigate(
                title === '场次管理'
                  ? '场次与名额'
                  : title === '预约名单'
                    ? '预约管理'
                    : '现场核销',
              )
            }
          >
            <span className="quick-icon">
              <Icon size={21} />
            </span>
            <div>
              {title}
              <small>{sub}</small>
            </div>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </section>
      <section className="panel reservations">
        <div className="panel-title">
          <h2>最新预约</h2>
          <Button variant="ghost" onClick={() => navigate('预约管理')}>
            查看全部
            <ArrowRight />
          </Button>
        </div>
        <BookingTable rows={data.bookings.slice(0, 5)} />
      </section>
      <section className="panel notice">
        <div className="panel-title">
          <h2>预约须知</h2>
          <span>✦</span>
        </div>
        <div>
          <b>01</b>
          <p>
            体验限约一种<small>每位嘉宾每场活动仅保留一条有效预约。</small>
          </p>
        </div>
        <div>
          <b>02</b>
          <p>
            提前 8 小时修改<small>支持改签和取消，释放的名额自动递补。</small>
          </p>
        </div>
        <div>
          <b>03</b>
          <p>
            提前 15 分钟到场<small>出示专属入场凭证，完成现场核销。</small>
          </p>
        </div>
      </section>
    </div>
  );
}
