'use client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import './participation-editor.css';
export default function ParticipationEditor({value,onChange,disabled=false}:{value:any[];onChange:(v:any[])=>void;disabled?:boolean}) {
 const update=(index:number,patch:any)=>onChange(value.map((m,i)=>i===index?{...m,...patch}:m));
 return <div className="participation-editor">
  <div className="participation-editor-heading"><div><h3>参与方式与体验</h3><p>每种参与方式统一维护场次，所选体验共用一个日期、时间和名额。</p></div><Button type="button" variant="outline" disabled={disabled||value.length>=10} onClick={()=>onChange([...value,{name:'',kind:'direct',enabled:true,items:[]}])}>＋ 新增参与方式</Button></div>
  {!value.length&&<div className="participation-editor-empty">暂无参与方式，点击上方按钮新增</div>}
  {value.map((mode,index)=><div className="participation-editor-card" key={mode.id||index}>
   <div className="participation-editor-row"><strong>方式 {index+1}</strong><label className="participation-enabled"><input type="checkbox" disabled={disabled} checked={!!mode.enabled} onChange={e=>update(index,{enabled:e.target.checked})}/>启用</label><Button type="button" variant="ghost" disabled={disabled} onClick={()=>onChange(value.filter((_,i)=>i!==index))}>移除方式</Button></div>
   <div className="participation-editor-fields"><label>参与方式名称<Input required value={mode.name} maxLength={60} disabled={disabled} placeholder="例如：自由参观、手作体验、贵宾专场" onChange={e=>update(index,{name:e.target.value})}/></label><label>预约规则<select value={mode.kind} disabled={disabled} onChange={e=>update(index,{kind:e.target.value,items:[]})}><option value="direct">直接选择日期和时间</option><option value="experiences">选择体验后预约（体验可多选）</option></select></label></div>
   {mode.kind==='experiences'&&<div className="participation-items"><div className="participation-editor-row"><strong>体验项目</strong><Button type="button" variant="outline" disabled={disabled||mode.items.length>=20} onClick={()=>update(index,{items:[...mode.items,{name:'',enabled:true}]})}>＋ 新增体验</Button></div>{mode.items.map((item:any,i:number)=><div className="participation-item" key={item.id||i}><textarea required rows={3} value={item.name} maxLength={80} disabled={disabled} aria-label="体验内容" placeholder={'第一行填写体验名称，回车换行填写说明\n例如：仅登岛参观\n自由观展 + 迎宾区护照领取'} onChange={e=>update(index,{items:mode.items.map((x:any,n:number)=>n===i?{...x,name:e.target.value}:x)})}/><label className="participation-enabled"><input type="checkbox" disabled={disabled} checked={item.enabled!==0&&item.enabled!==false} onChange={e=>update(index,{items:mode.items.map((x:any,n:number)=>n===i?{...x,enabled:e.target.checked}:x)})}/>启用</label><Button type="button" variant="ghost" disabled={disabled} onClick={()=>update(index,{items:mode.items.filter((_:any,n:number)=>n!==i)})}>移除</Button></div>)}{!mode.items.length&&<p>点击“新增体验”，逐项填写内容。第一行为名称，换行后为说明。</p>}</div>}
  </div>)}
 </div>;
}
