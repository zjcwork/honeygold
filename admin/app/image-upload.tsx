'use client';
import { useEffect, useRef, useState } from 'react';
export default function ImageUpload({name,label,initialValue=''}:{name:string;label:string;initialValue?:string}) {
 const [value,setValue]=useState(initialValue),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const container=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const form=container.current?.closest('form');
  if(!busy||!form)return;
  const preventSave=(e:Event)=>{e.preventDefault();e.stopImmediatePropagation();setError('图片正在上传，请稍候再保存');};
  form.addEventListener('submit',preventSave,true);
  return()=>form.removeEventListener('submit',preventSave,true);
 },[busy]);
 async function upload(file?:File){
  if(!file||busy)return;
  if(file.size>1048576){setError('请选择1MB以内的图片');return;}
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/admin/images',{method:'POST',headers:{Authorization:'Bearer '+(localStorage.getItem('hg_admin')||''),'Content-Type':file.type},body:file});
   const result:any=await r.json();if(!r.ok)throw Error(result.error||'上传失败');setValue(result.url);
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 return <div className="field" ref={container}><span>{label}</span><div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>{value&&<img src={value} alt={label+'预览'} style={{width:100,height:100,objectFit:'contain',background:'#f4f5f0',borderRadius:8}}/>}<label style={{display:'inline-flex',padding:'10px 16px',border:'1px solid #dce4dc',borderRadius:7,cursor:busy?'wait':'pointer',color:'#194f40'}}>{busy?'上传中…':value?'更换图片':'本地上传'}<input type="file" aria-label={label+'本地上传'} accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} style={{display:'none'}} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>{value&&<button type="button" disabled={busy} onClick={()=>setValue('')}>移除</button>}</div><input type="hidden" name={name} value={value}/><small>支持 JPG、PNG、WebP、GIF，单张不超过 1MB。上传后请保存活动。</small>{error&&<small role="alert" style={{color:'#b42318'}}>{error}</small>}</div>;
}
