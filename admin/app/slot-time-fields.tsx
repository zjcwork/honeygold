'use client';
import {useState} from 'react';
import {Input} from '@/components/ui/input';
import {generateSlotTimes} from '@/lib/slot-times';
export default function SlotTimeFields({initialTime,editing}:{initialTime:string,editing:boolean}){
 const parts=(initialTime||'13:00-13:40').split('-');
 const [batch,setBatch]=useState(false),[start,setStart]=useState(parts[0]),[end,setEnd]=useState(parts[1]||''),[limit,setLimit]=useState('17:40'),[interval,setInterval]=useState(60),[duration,setDuration]=useState(40);
 let preview:string[]=[],error='';if(batch){try{preview=generateSlotTimes(start,limit,interval,duration)}catch(e:any){error=e.message}}
 return <>
 {!editing&&<label className="field">新增方式<select value={batch?'batch':'single'} onChange={e=>setBatch(e.target.value==='batch')}><option value="single">单个时间范围</option><option value="batch">批量生成时间范围</option></select></label>}
 {!editing&&<button type="button" className="button" onClick={()=>{setBatch(true);setStart('13:00');setLimit('17:40');setInterval(60);setDuration(40)}}>使用 13:00–17:40 五场预设</button>}
 <input type="hidden" name="batch" value={batch?'yes':'no'}/>
 {!batch&&<input type="hidden" name="time" value={end?`${start}-${end}`:start}/>}
 <label className="field">开始时间<Input type="time" name={batch?'startTime':undefined} required value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label className="field">{batch?'最晚结束时间':'结束时间'}<Input type="time" name={batch?'endTime':undefined} required={!editing||!!parts[1]||batch} value={batch?limit:end} onChange={e=>batch?setLimit(e.target.value):setEnd(e.target.value)}/></label>
 {batch&&<><label className="field">每场时长（分钟）<Input type="number" name="duration" min={1} max={interval} required value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label><label className="field">开始时间间隔（分钟）<Input type="number" name="interval" min={5} max={240} required value={interval} onChange={e=>setInterval(Number(e.target.value))}/></label><div role="status" style={{padding:14,background:'#f4f6f1',borderRadius:8}}>{error||`预计生成 ${preview.length} 场：${preview.join('、')}`}<p>每场使用下方设置的名额；已有相同参与方式、日期和时间范围的场次会跳过。</p></div></>}
 </>;
}
