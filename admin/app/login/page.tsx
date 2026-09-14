'use client';
import { useEffect, useState } from 'react';
import { LockKeyhole, ArrowRight } from 'lucide-react';
import { api } from '@/lib/client';
import './login.css';
export default function Login() {
  const [ready, setReady] = useState(false);
  const [username,setUsername]=useState(''), [password,setPassword]=useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load() {
    setError('');
    try { await api('config'); setReady(true); }
    catch { setError('无法连接服务，请重试'); }
  }
  useEffect(() => { void load(); }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault(); if (busy || !ready) return;
    setBusy(true); setError('');
    try {
      const result = await api('auth/admin', { username, password });
      localStorage.setItem('hg_admin', result.token);
      window.location.replace('/?view=' + encodeURIComponent('工作台'));
    } catch (e: any) { setError(e.message); setBusy(false); }
  }
  return <main className="admin-login">
    <section className="login-story"><div className="login-brand">HONEY<span>GOLD</span></div><div className="login-story-copy"><span>HONEY GOLD CLUB</span><h1>每一场美好，<br />从这里开始。</h1><p>让每一次相遇有序发生，<br />用心准备每一份品牌体验。</p></div><small>蜜金 · 活动管理平台</small></section>
    <section className="login-form-side"><div className="login-card"><div className="login-symbol"><LockKeyhole size={24} /></div><h2>欢迎回来</h2><p className="login-intro">登录蜜金运营后台，开始管理活动。</p><form onSubmit={login}>
      {ready && <><label htmlFor="admin-username">账号<input id="admin-username" autoComplete="username" required maxLength={40} value={username} disabled={busy} onChange={e=>setUsername(e.target.value)} placeholder="请输入账号" /></label><label htmlFor="admin-password">密码<input id="admin-password" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} placeholder="请输入密码" /></label></>}

      {error && <p role="alert" className="login-error">{error}</p>}
      {!ready && error ? <button type="button" onClick={load}>重新连接</button> : <button type="submit" disabled={!ready || busy}>{!ready ? '正在连接…' : busy ? '登录中…' : '登录'}<ArrowRight size={18} /></button>}
    </form><div className="login-caption">HONEY GOLD · 运营管理工作台</div></div><small className="login-copyright">© {new Date().getFullYear()} 蜜金</small></section>
  </main>;
}
