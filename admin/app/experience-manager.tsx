'use client';
import {useState} from 'react';
import {api} from '@/lib/client';
import {Button} from '@/components/ui/button';
import ParticipationEditor from './participation-editor';
export default function ExperienceManager({modes,refresh,eventId}:{modes:any[];refresh:()=>Promise<void>;eventId:string}){
 const [value,setValue]=useState(modes),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const result=await api('admin/participation',{eventId,modes:value});setValue(result.modes);await refresh();setMessage('参与方式与体验已保存')}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}}>
 <ParticipationEditor value={value} onChange={setValue} disabled={busy}/><p className="muted" style={{margin:'16px 0'}}>已有场次的项目可改名或停用；删除前须先移除关联场次。</p>{message&&<p role="status">{message}</p>}<Button type="submit" disabled={busy||!value.length}>{busy?'保存中…':'保存参与方式'}</Button></form>;
}
