'use client';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
export default function ImageUpload({name,label,initialValue=''}:{name:string;label:string;initialValue?:string}) {
 const [value,setValue]=useState(initialValue),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null);
 async function upload(file?:File){
  if(!file)return;
  if(file.size>1048576){setError('请选择1MB以内的图片');return;}
  setBusy(true);setError('');input.current?.setCustomValidity('图片正在上传，请稍候');
  try{
   const r=await fetch('/api/admin/images',{method:'POST',headers:{Authorization:'Bearer '+(localStorage.getItem('hg_admin')||''),'Content-Type':file.type},body:file});
   const result:any=await r.json();if(!r.ok)throw Error(result.error||'上传失败');setValue(result.url);
  }catch(e:any){setError(e.message);}finally{setBusy(false);input.current?.setCustomValidity('');}
 }
 return <div className="field"><label htmlFor={`image-${name}`}>{label}</label><div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>{value&&<img src={value} alt={label+'预览'} style={{width:100,height:100,objectFit:'contain',background:'#f4f5f0',borderRadius:8}}/>}<label style={{display:'inline-flex',padding:'10px 16px',border:'1px solid #dce4dc',borderRadius:7,cursor:busy?'wait':'pointer',color:'#194f40'}}>{busy?'上传中…':value?'更换图片':'本地上传'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} style={{display:'none'}} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>{value&&<button type="button" disabled={busy} onClick={()=>setValue('')}>移除</button>}</div><Input ref={input} id={`image-${name}`} name={name} type="url" maxLength={2048} placeholder="也可粘贴HTTPS图片地址" value={value} onChange={e=>setValue(e.target.value)} readOnly={busy}/><small>支持 JPG、PNG、WebP、GIF，单张不超过 1MB。上传后请保存活动。</small>{error&&<small role="alert" style={{color:'#b42318'}}>{error}</small>}</div>;
}
