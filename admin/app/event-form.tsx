'use client';
import {useState} from 'react';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import ParticipationEditor from './participation-editor';
import ImageUpload from './image-upload';
import './event-form.css';
export default function EventForm({event,busy,onSave,onCancel}:{event:any;busy:boolean;onSave:(value:any)=>void;onCancel:()=>void}){
 const [start,setStart]=useState(event.start_date||''),[end,setEnd]=useState(event.end_date||'');
 const [modes,setModes]=useState<any[]>(event.participation_modes||[]);
 const [summary,setSummary]=useState(event.summary||'');
 return <form className="event-form" onSubmit={e=>{e.preventDefault();if(busy)return;onSave({...Object.fromEntries(new FormData(e.currentTarget)),participation_modes:modes})}}>
  <div className="event-form-scroll"><fieldset disabled={busy}>
   <section className="event-form-section"><div className="event-section-title"><span>01</span><h3>基本信息</h3><small>* 为必填</small></div>
    <div className="event-fields"><label className="field event-field-wide">活动名称 *<Input name="title" defaultValue={event.title||''} required maxLength={100} placeholder="请输入活动名称" /></label>
    <label className="field">英文副标题 *<Input name="subtitle" defaultValue={event.subtitle||''} required maxLength={200} placeholder="例如 HONEY GOLD CLUB" /></label>
    <label className="field">活动地点 *<Input name="location" defaultValue={event.location||''} required maxLength={200} placeholder="城市及具体地址" /></label>
    <label className="field">开始日期 *<Input name="start_date" type="date" required value={start} max={end||undefined} onChange={e=>setStart(e.target.value)}/></label>
    <label className="field">结束日期 *<Input name="end_date" type="date" required value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label></div>
   </section>
   <section className="event-form-section"><ParticipationEditor value={modes} onChange={setModes} disabled={busy}/></section>
   <section className="event-form-section"><div className="event-section-title"><span>02</span><h3>活动展示</h3></div>
    <div className="event-fields"><label className="field event-field-wide">首页活动简介<textarea name="summary" rows={3} maxLength={300} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="简要介绍活动亮点，用于首页活动列表"/><small className="event-word-count">{summary.length} / 300</small></label>
    <ImageUpload name="cover_image" label="活动封面图" initialValue={event.cover_image||''}/><ImageUpload name="hero_image" label="详情顶部图" initialValue={event.hero_image||''}/>
    <label className="field event-field-wide">详情页活动介绍 *<textarea name="description" defaultValue={event.description||''} required rows={6} maxLength={8000} placeholder="介绍活动内容、参与方式和亮点"/></label>
    <label className="field event-field-wide">活动须知<textarea name="notices" defaultValue={event.notices||''} rows={4} maxLength={8000} placeholder="填写到场及参与须知，选填"/></label></div>
   </section>
   <section className="event-form-section"><div className="event-section-title"><span>03</span><h3>客服信息</h3><small>选填 · 报名成功后展示</small></div><div className="event-fields"><label className="field">客服微信号<Input name="contact_wechat" defaultValue={event.contact_wechat||''} maxLength={100} placeholder="请输入客服微信号"/></label><ImageUpload name="contact_qr" label="客服微信二维码" initialValue={event.contact_qr||''}/></div></section>
  </fieldset></div>
  <div className="event-form-footer"><span>{event.id?'保存后更新活动信息':'创建后可维护体验与场次'}</span><div><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>取消</Button><Button type="submit" className="primary" disabled={busy||!modes.length}>{busy?'保存中…':event.id?'保存修改':'创建活动'}</Button></div></div>
 </form>;
}
