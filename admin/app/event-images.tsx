'use client';
import {useState} from 'react';
import {Input} from '@/components/ui/input';
export default function EventImages({event}:{event:any}){
 const [values,setValues]=useState<Record<string,string>>({cover_image:event.cover_image||'',hero_image:event.hero_image||''});
 return <section style={{display:'grid',gap:16}}>{[['cover_image','活动封面图'],['hero_image','详情顶部图']].map(([key,label])=><label className="field" key={key}>{label}{key==='detail_images'?<textarea name={key} value={values[key]} rows={5} onChange={e=>setValues({...values,[key]:e.target.value})}/>:<Input name={key} type="url" maxLength={2048} placeholder="https://…" value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})}/>}<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{values[key].split('\n').map(s=>s.trim()).filter(s=>s.startsWith('https://')).map((src,i)=><img key={i} src={src} alt={`${label}预览 ${i+1}`} style={{width:100,height:100,objectFit:'contain',background:'#f3f1ea'}}/>)}</div></label>)}</section>;
}
