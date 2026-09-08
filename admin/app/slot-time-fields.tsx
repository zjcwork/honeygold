'use client';
import {useState} from 'react';
import {Input} from '@/components/ui/input';
import {generateSlotTimes} from '@/lib/slot-times';
export default function SlotTimeFields({initialTime,editing}:{initialTime:string,editing:boolean}){
 const [batch,setBatch]=useState(false),[start,setStart]=useState(initialTime||'10:30'),[end,setEnd]=useState('17:00'),[interval,setInterval]=useState(30);
 let preview:string[]=[],error='';if(batch){try{preview=generateSlotTimes(start,end,interval)}catch(e:any){error=e.message}}
 return <>{!editing&&<label className="field">新增方式<select value={batch?'batch':'single'} onChange={e=>setBatch(e.target.value==='batch')}><option value="single">单个场次</option><option value="batch">按时间段批量新增</option></select></label>}<input type="hidden" name="batch" value={batch?'yes':'no'}/><label className="field">{batch?'开始时间':'时间'}<Input type="time" name={batch?'startTime':'time'} required value={start} onChange={e=>setStart(e.target.value)}/></label>{batch&&<><label className="field">结束时间（不包含）<Input type="time" name="endTime" required value={end} onChange={e=>setEnd(e.target.value)}/></label><label className="field">场次间隔（分钟）<Input type="number" name="interval" min={5} max={240} required value={interval} onChange={e=>setInterval(Number(e.target.value))}/></label><div role="status" style={{padding:14,background:'#f4f6f1',borderRadius:8}}>{error||`预计生成 ${preview.length} 场：${preview.join('、')}`}<p>每场使用下方设置的名额；已有同活动、同体验、同日期和时间的场次会跳过。</p></div></>}</>;
}
