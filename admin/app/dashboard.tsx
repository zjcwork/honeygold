'use client';
import { useEffect, useState } from 'react';
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
  const events = data.events.filter((e:any)=>e.status === 'published');
  const [index,setIndex]=useState(0),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[paused,setPaused]=useState(false);
  const count=events.length,activeIndex=count?index%count:0,event=events[activeIndex];
  useEffect(()=>{if(count<2||hovered||focused||paused)return;const timer=setInterval(()=>setIndex(i=>(i+1)%count),5000);return()=>clearInterval(timer)},[count,hovered,focused,paused]);

  return (
    <div className="dashboard-grid">
      <section className="panel featured" aria-label="进行中的活动轮播" aria-roledescription="轮播" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setFocused(false)}}>
        <div className="panel-title">
          <h2>
            进行中的活动 <span>{count}</span>
          </h2>
          <Button variant="ghost" onClick={() => navigate('活动管理')}>
            全部活动
            <ArrowRight />
          </Button>
        </div>
        {event ? (
          <div className="feature-body" role="group" aria-roledescription="幻灯片" aria-label={`${activeIndex+1} / ${count}：${event.title}`}>
            {event.cover_image ? <img className="event-poster dashboard-event-cover" src={event.cover_image} alt={event.title} /> : <div className="event-poster">
              <div>{event.subtitle}</div>
              <strong>{event.title}</strong>
              <small>{event.start_date} – {event.end_date}</small>
            </div>}
            <div className="feature-copy">
              <div style={{ position: 'absolute', right: 0, top: 0 }}>
                <Badge value={event.status} />
              </div>
              <div className="eyebrow">{event.subtitle}</div>
              <h2>{event.title}</h2>
              {event.summary && <p>{event.summary.length > 48 ? event.summary.slice(0,48)+'…' : event.summary}</p>}
              <div className="event-meta">
                <CalendarDays size={16} />
                {event.start_date} – {event.end_date.slice(5)}
              </div>
              <div className="event-meta">⌖ {event.location}</div>
              <div className="feature-footer">
                <span>
                  {(data.experiences || []).filter((x:any)=>x.event_id===event.id && x.enabled).length} 种已启用体验
                </span>
                <Button variant="outline" onClick={() => navigate('活动管理')}>
                  管理活动
                  <ArrowUpRight />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">暂无进行中的活动。</div>
        )}
        {count>1 && <div className="featured-carousel-controls">
          <Button variant="ghost" aria-label="上一个活动" onClick={()=>setIndex((activeIndex-1+count)%count)}>‹</Button>
          <div className="featured-carousel-dots">{events.map((e:any,i:number)=><button type="button" key={e.id} aria-label={`查看活动：${e.title}`} aria-pressed={i===activeIndex} onClick={()=>setIndex(i)}/>)}</div>
          <span>{activeIndex+1} / {count}</span>
          <Button variant="ghost" aria-label="下一个活动" onClick={()=>setIndex((activeIndex+1)%count)}>›</Button>
          <Button variant="ghost" onClick={()=>setPaused(p=>!p)}>{paused?'自动播放':'暂停轮播'}</Button>
        </div>}
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
