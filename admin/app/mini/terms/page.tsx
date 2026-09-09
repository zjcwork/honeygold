 'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/client';
import {legalTitles} from '@/lib/legal';
export default function Terms(){
 const [title,setTitle]=useState('使用条款'),[body,setBody]=useState('正在加载…');
 useEffect(()=>{const raw=new URLSearchParams(window.location.search).get('type')||'terms';const key=Object.hasOwn(legalTitles,raw)?raw as keyof typeof legalTitles:'terms';setTitle(legalTitles[key]);api('legal',undefined,'user').then(v=>setBody(v[key])).catch(()=>setBody('加载失败，请刷新重试'));},[]);
 return <main style={{maxWidth:680,margin:'40px auto',padding:24,lineHeight:2}}><button onClick={()=>window.history.back()}>← 返回</button><h1>{title}</h1><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{body}</p></main>;
}
