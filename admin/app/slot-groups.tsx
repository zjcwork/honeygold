'use client';
import {useState, type ReactNode} from 'react';
import {Button} from '@/components/ui/button';

type Props={slots:any[],events:any[],experiences:any[],eventId:string,onEventChange:(id:string)=>void,query:string,onEdit:(s:any)=>void,onAdd:(s:any)=>void,onDelete:(s:any)=>void,busy:boolean};
export default function SlotGroups({slots,events,experiences:catalog,eventId,onEventChange,query,onEdit,onAdd,onDelete,busy}:Props){
 const [experience,setExperience]=useState<string|null>(null);
 const activeEvent=events.find(e=>e.id===eventId)||events[0];
 const activitySlots=slots.filter(s=>s.event_id===activeEvent?.id);
 const experiences=[...new Set(catalog.filter(e=>e.event_id===activeEvent?.id && e.name).map(e=>e.name))];
 const selectedExperience=experience!==null&&experiences.includes(experience)?experience:experiences[0]||'';
 const experienceSlots=activitySlots.filter(s=>s.experience===selectedExperience);
 const selectors=<div className="calendar-context-selectors"><label>活动<select aria-label="选择活动" value={activeEvent?.id||''} disabled={!events.length} onChange={e=>{onEventChange(e.target.value);setExperience(null)}}>{!events.length&&<option value="">暂无活动</option>}{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label><label>体验<select aria-label="选择体验" value={selectedExperience} disabled={!experiences.length} onChange={e=>setExperience(e.target.value)}>{!experiences.length&&<option value="">无需选择体验</option>}{experiences.map(name=><option key={name} value={name}>{name}</option>)}</select></label></div>;
 return <div className="slot-groups">
  {activeEvent?<SlotCalendar selectors={selectors} key={JSON.stringify([activeEvent.id,selectedExperience])} event={activeEvent} experience={selectedExperience} slots={experienceSlots} query={query} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} busy={busy}/>:<section className="panel slot-activity"><header className="slot-activity-heading">{selectors}</header><div className="empty">{activeEvent?'请在活动管理的「体验维护」中添加体验，再添加场次。':'请先创建活动。'}</div></section>}
 </div>;
}
function SlotCalendar({selectors,event,experience,slots,query,onAdd,onEdit,onDelete,busy}:{selectors:ReactNode,event:any,experience:string,slots:any[],query:string,onAdd:Props['onAdd'],onEdit:Props['onEdit'],onDelete:Props['onDelete'],busy:boolean}){
 const firstMonth=event.start_date.slice(0,7),lastMonth=event.end_date.slice(0,7);
 const [chosenMonth,setMonth]=useState(firstMonth);
 const month=chosenMonth<firstMonth||chosenMonth>lastMonth?firstMonth:chosenMonth;
 const [year,m]=month.split('-').map(Number);
 const offset=(new Date(year,m-1,1).getDay()+6)%7;
 const dayCount=new Date(year,m,0).getDate();
 const cells=Array.from({length:Math.ceil((offset+dayCount)/7)*7},(_,i)=>{const day=i-offset+1;return day>0&&day<=dayCount?`${month}-${String(day).padStart(2,'0')}`:null});
 const rows=slots.filter(s=>s.date.startsWith(month)&&(s.experience+s.date+s.time).includes(query));
 function shift(delta:number){const d=new Date(year,m-1+delta,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
 const add=(date:string)=>onAdd({eventId:event.id,experience,date,time:'10:30',capacity:2});
 const today=new Date();const todayKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 return <section className="panel slot-activity">
  <header className="slot-activity-heading"><div>{selectors}<p>{event.start_date} 至 {event.end_date} · 当前月 {rows.length} 场 · 已预约 {rows.reduce((n,s)=>n+Number(s.booked),0)} / 总名额 {rows.reduce((n,s)=>n+Number(s.capacity),0)}</p></div></header>
  <div className="slot-calendar-toolbar"><Button variant="outline" disabled={month<=firstMonth} onClick={()=>shift(-1)}>上个月</Button><label><span className="sr-only">选择月份</span><input type="month" min={firstMonth} max={lastMonth} value={month} onChange={e=>{if(e.target.value>=firstMonth&&e.target.value<=lastMonth)setMonth(e.target.value)}}/></label><Button variant="outline" disabled={month>=lastMonth} onClick={()=>shift(1)}>下个月</Button><span className="muted">点击日期新增，点击场次卡片编辑</span></div>
  <div className="slot-calendar-scroll"><table className="slot-calendar"><caption className="sr-only">{year}年{m}月场次日历</caption><thead><tr>{['周一','周二','周三','周四','周五','周六','周日'].map(d=><th key={d} scope="col">{d}</th>)}</tr></thead><tbody>{Array.from({length:cells.length/7},(_,week)=><tr key={week}>{cells.slice(week*7,week*7+7).map((day,i)=>{
   if(!day)return <td key={i} className="calendar-outside"/>;
   const available=day>=event.start_date&&day<=event.end_date;
   const dayRows=rows.filter(s=>s.date===day).sort((a,b)=>a.time.localeCompare(b.time));
   return <td key={day} className={available?'':'calendar-outside'}><div className="calendar-day-heading">{available?<button type="button" disabled={busy} className={day===todayKey?'calendar-date-add calendar-today':'calendar-date-add'} aria-label={`在${day}新增场次`} title="点击日期新增场次" onClick={()=>add(day)}>{Number(day.slice(-2))}</button>:<time dateTime={day}>{Number(day.slice(-2))}</time>}</div>{dayRows.map(s=><button type="button" className="calendar-slot calendar-slot-button" title={`${s.time} · 已预约 ${s.booked} / 总名额 ${s.capacity} · 剩余 ${Math.max(0,s.capacity-s.booked)} · 候补 ${s.waiting}`} key={s.id} disabled={busy} onClick={()=>onEdit(s)} aria-label={`编辑${day} ${s.time}场次，已预约${s.booked}人，总名额${s.capacity}人`}><strong>{s.time}</strong><span className={s.booked>=s.capacity?'slot-full':''}>{s.booked}/{s.capacity}</span><span>候{s.waiting}</span></button>)}{available&&!dayRows.length&&<small className="calendar-empty">{query?'无匹配场次':'暂无场次'}</small>}</td>
  })}</tr>)}</tbody></table></div>
 </section>;
}
