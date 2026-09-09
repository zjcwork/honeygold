'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { legalTitles, defaultLegal } from '@/lib/legal';
import { Button } from '@/components/ui/button';
import './legal-manager.css';

type LegalKey = keyof typeof legalTitles;
const keys = Object.keys(legalTitles) as LegalKey[];
export default function LegalManager() {
  const [value, setValue] = useState<typeof defaultLegal | null>(null);
  const [saved, setSaved] = useState<typeof defaultLegal | null>(null);
  const [active, setActive] = useState<LegalKey>('terms');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function load() {
    setFailed(false); setMessage('');
    try { const data = await api('admin/legal'); setValue(data); setSaved(data); }
    catch (e: any) { setFailed(true); setMessage(e.message); }
  }
  useEffect(() => { void load(); }, []);
  const dirty = keys.some(key => value?.[key] !== saved?.[key]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !value) return;
    const empty = keys.find(key => !value[key].trim());
    if (empty) { setActive(empty); setFailed(true); setMessage(`请填写${legalTitles[empty]}`); return; }
    setBusy(true); setFailed(false); setMessage('');
    try {
      const data = await api('admin/legal', value);
      setValue(data); setSaved(data); setMessage('保存成功，小程序将显示最新内容');
    } catch (e: any) { setFailed(true); setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <section className="panel legal-manager">
    <div className="legal-tabs" role="tablist" aria-label="条款类型">
      {keys.map((key, index) => <button key={key} type="button" role="tab"
        id={`legal-tab-${key}`} aria-selected={active === key} aria-controls="legal-editor"
        tabIndex={active === key ? 0 : -1} className={active === key ? 'selected' : ''}
        onClick={() => setActive(key)} onKeyDown={e => {
          const next = e.key === 'ArrowRight' ? (index + 1) % keys.length : e.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length : e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : -1;
          if (next < 0) return;
          e.preventDefault(); setActive(keys[next]); document.getElementById(`legal-tab-${keys[next]}`)?.focus();
        }}>{legalTitles[key]}{value && value[key] !== saved?.[key] && <span className="legal-draft-dot" aria-label="未保存" />}</button>)}
    </div>
    <form onSubmit={save}>
      <div id="legal-editor" role="tabpanel" aria-labelledby={`legal-tab-${active}`} className="legal-editor">
        <div className="legal-editor-heading"><div><h2>{legalTitles[active]}</h2><p>内容将在报名时供用户点击查看，支持换行分段。</p></div><span className="legal-status">{dirty ? '有未保存的修改' : '已与当前配置同步'}</span></div>
        {value ? <><label className="legal-input-label" htmlFor="legal-body">正文内容</label><textarea id="legal-body" disabled={busy} maxLength={20000} value={value[active]} placeholder={`请输入${legalTitles[active]}…`} onChange={e => { setValue({ ...value, [active]: e.target.value }); setMessage(''); }} /><div className="legal-count">{value[active].length.toLocaleString()} / 20,000 字</div></> : <div className="legal-loading">{failed ? <Button type="button" variant="outline" onClick={load}>重新加载</Button> : '正在加载条款…'}</div>}
      </div>
      <div className="legal-footer"><div><p>切换条款会保留当前修改</p><span role={failed ? 'alert' : 'status'} className={failed ? 'legal-error' : 'legal-feedback'}>{message || '保存后，三份说明的修改将一并生效。'}</span></div><Button className="primary" type="submit" disabled={busy || !value || !dirty}>{busy ? '保存中…' : '保存修改'}</Button></div>
    </form>
  </section>;
}
