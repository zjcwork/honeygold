'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, ImagePlus } from 'lucide-react';
import './content-manager.css';
export default function ContentManager({events}: {events: any[]}) {
  const [config,setConfig]=useState<any>(null), [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [failed,setFailed]=useState(false);
  const uploadLock=useRef(false);
  const [uploading,setUploading]=useState<number|null>(null);
  async function upload(index:number,file?:File){
    if(!file||uploadLock.current||busy)return;
    if(file.size>1048576){setFailed(true);setMessage('请选择1MB以内的图片');return;}
    uploadLock.current=true;setUploading(index);setFailed(false);setMessage('正在上传图片…');
    try{
      const response=await fetch('/api/admin/images',{method:'POST',headers:{Authorization:'Bearer '+(localStorage.getItem('hg_admin')||''),'Content-Type':file.type},body:file});
      const result:any=await response.json();
      if(!response.ok)throw Error(result.error||'图片上传失败');
      update(index,'image',result.url);setMessage('图片已上传，请点击保存配置生效');
    }catch(e:any){setFailed(true);setMessage(e.message||'图片上传失败，请重试');}
    finally{uploadLock.current=false;setUploading(null);}
  }
  useEffect(()=>{let active=true;api('admin/content').then(c=>{if(active)setConfig(c)}).catch(e=>{if(active){setFailed(true);setMessage(e.message)}});return()=>{active=false};},[]);
  const update=(index:number,key:string,value:any)=>setConfig((c:any)=> index<0?{...c,splash:{...c.splash,[key]:value}}:{...c,slides:c.slides.map((s:any,i:number)=>i===index?{...s,[key]:value}:s)});
  const move=(i:number,offset:number)=>setConfig((c:any)=>{const slides=[...c.slides];[slides[i],slides[i+offset]]=[slides[i+offset],slides[i]];return {...c,slides};});
  async function save(){if(busy||uploadLock.current)return;setBusy(true);setFailed(false);setMessage('正在保存…');try{
    const saved=await api('admin/content',config);
    const persisted=await api('admin/content');
    if(JSON.stringify(saved)!==JSON.stringify(persisted))throw Error('保存后的配置核对失败，请重试');
    setConfig(persisted);setMessage('保存成功，已写入数据库，刷新后仍会保留');
  }catch(e:any){setFailed(true);setMessage('未保存：'+e.message+'。请修改后重新保存，暂勿刷新页面。');}finally{setBusy(false);}}
  const card=(item:any,index:number)=><section key={index} style={{background:'white',padding:24,border:'1px solid #e4e7e1',borderRadius:12,marginBottom:18}}>
    <h3>{index<0?'开屏页':`轮播图 ${index+1}`}</h3>
    <div style={{display:'flex',gap:24,flexWrap:'wrap',marginTop:16}}>
      <div className={`content-upload ${index<0?'content-upload-portrait':'content-upload-landscape'}`}>
        <label className={`content-upload-area ${item.image?'has-image':''}`}>
          <input className="content-upload-input" type="file" aria-label={index<0?'上传或更换开屏图片':`上传或更换轮播图片 ${index+1}`} accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(index,file);}} />
          {item.image?<img src={item.image} alt={item.title||'图片预览'}/>:<span className="content-upload-empty"><ImagePlus size={28}/><span>点击上传图片</span></span>}
          {item.image&&<span className="content-upload-caption"><Upload size={14}/>{uploading===index?'上传中…':'点击更换'}</span>}
          {uploading===index&&<span className="content-upload-progress">上传中…</span>}
        </label>
        <div className="content-upload-meta"><span>{index<0?'建议竖图':'建议横图'} · 最大 1MB</span>{item.image&&<button type="button" onClick={()=>update(index,'image','')}>移除</button>}</div>
      </div>
      <div style={{flex:1,minWidth:240,display:'grid',gap:12}}>
        <label>标题<Input maxLength={80} value={item.title} onChange={e=>update(index,'title',e.target.value)}/></label>
        <label>点击跳转活动<select value={item.eventId} onChange={e=>update(index,'eventId',e.target.value)} style={{display:'block',padding:10,width:'100%',border:'1px solid #ddd'}}><option value="">不跳转</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
        {index<0&&<label>停留时间（1–10秒）<Input type="number" min={1} max={10} value={item.duration} onChange={e=>update(index,'duration',Number(e.target.value))}/></label>}
        <label><input type="checkbox" checked={item.enabled} onChange={e=>update(index,'enabled',e.target.checked)}/> 启用</label>
        {index>=0&&<div style={{display:'flex',gap:8}}><Button disabled={index===0} variant="outline" onClick={()=>move(index,-1)}>上移</Button><Button disabled={index===config.slides.length-1} variant="outline" onClick={()=>move(index,1)}>下移</Button><Button variant="outline" onClick={()=>setConfig({...config,slides:config.slides.filter((_:any,i:number)=>i!==index)})}>删除</Button></div>}
      </div>
    </div>
  </section>;
  return <div>{message&&<p role="status" style={{padding:12}}>{message}</p>}{config?<><p style={{marginBottom:20}}>管理开屏和首页顶部图片。修改后点击保存生效；关闭或删除全部轮播图时显示默认首页。</p><fieldset disabled={busy||uploading!==null} style={{border:0,padding:0}}>{card(config.splash,-1)}{config.slides.map(card)}<div style={{position:'sticky',bottom:0,background:'white',padding:16,borderTop:'1px solid #ddd',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><Button type="button" variant="outline" disabled={busy||config.slides.length>=10} onClick={()=>setConfig({...config,slides:[...config.slides,{title:'',image:'',eventId:'',enabled:false}]})}>新增轮播图</Button><Button type="button" disabled={busy} onClick={save}>{busy?'保存中…':'保存配置'}</Button><span role={failed?'alert':'status'} style={{color:failed?'#b42318':'#214c38'}}>{message||'修改后请点击保存配置'}</span></div></fieldset></>:<p>正在加载配置…</p>}</div>;
}
