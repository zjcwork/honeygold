'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, CalendarDays, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/client';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import '../mini.css';
import './register.css';
export default function Register() {
  const [booking,setBooking]=useState<any>(null),[successOpen,setSuccessOpen]=useState(false),[subscriptionMessage,setSubscriptionMessage]=useState('');
  const [event, setEvent] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [isDemo, setIsDemo] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [terms, setTerms] = useState(false),
    [photo, setPhoto] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    (async () => {
      try {
        const [e, c] = await Promise.all([
          api(
            'events/' + encodeURIComponent(params.get('event') || ''),
            undefined,
            'user',
          ),
          api('config', undefined, 'user'),
        ]);
        const slot = e.slots.find((s: any) => s.id === params.get('slot'));
        if (!slot) throw Error('场次不存在，请返回重新选择');
        setEvent(e);
        setSelected(slot);
        setIsDemo(c.demo);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(booking){setSuccessOpen(true);return;}
    if (busy) return;
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      if (!localStorage.getItem('hg_user')) {
        throw Error('请使用微信小程序完成手机号授权后预约');
      }
      const b = await api(
        'bookings',
        { ...f, slotId: selected.id, terms, photoConsent: photo },
        'user',
      );
      setBooking(b);setSuccessOpen(true);setBusy(false);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  function viewBooking(){if(booking)window.location.replace('/mini?booking='+encodeURIComponent(booking.id));}
  function back() {
    if(booking){viewBooking();return;}
    if (history.length > 1) history.back();
    else
      location.assign(
        '/mini' + (event ? '?event=' + encodeURIComponent(event.id) : ''),
      );
  }
  return (
    <div className="mini-stage">
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}><DialogContent showCloseButton={false} className="booking-success-web"><button className="booking-success-web-close" onClick={()=>setSuccessOpen(false)}>取消</button><div className="booking-success-web-check">✓</div><DialogTitle>{booking?.status==='waitlisted'?'候补提交成功':'报名成功'}</DialogTitle><DialogDescription>{booking?.status==='waitlisted'?'当前名额已满，请等待递补':'报名已完成，可查看报名信息及入场凭证。'}</DialogDescription>{subscriptionMessage&&<p role="status">{subscriptionMessage}</p>}<div className="booking-success-web-actions"><button onClick={()=>setSubscriptionMessage('请在微信小程序中订阅活动通知。')}>订阅活动通知</button><button onClick={viewBooking}>查看报名信息</button></div></DialogContent></Dialog>
      <main className="phone registration-phone">
        <div className="wechat-top unified-navigation">
          <button
            className="navigation-back"
            aria-label="返回选择场次"
            onClick={back}
          >
            <ChevronLeft size={26} strokeWidth={1.8} />
          </button>
          <b>报名信息</b>
          <span>•••　◉</span>
        </div>
        <div className="registration-body">
          <h1>填写报名信息</h1>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {event && selected ? (
            <>
              <div className="registration-event">
                {event.cover_image ? <img className="event-cover-image" src={event.cover_image} alt={event.title}/> : <div className="mini-cover">
                  <small>
                    HONEY GOLD
                    <br />
                    CLUB
                  </small>
                  <b>
                    海岛
                    <br />
                    漫游记
                  </b>
                </div>}
                <div>
                  <small>{event.subtitle}</small>
                  <h2>{event.title}</h2>
                  <p>{event.description.slice(0, 65)}…</p>
                  <label>
                    <CalendarDays size={12} />
                    {selected.date} {selected.time}
                  </label>
                  <label>
                    <MapPin size={12} />
                    {event.location}
                  </label>
                  <span className="status">
                    {selected.booked >= selected.capacity
                      ? '候补报名'
                      : '预约中'}{' '}
                    ›
                  </span>
                </div>
              </div>
              <p className="registration-selection">{selected.experience}</p>
              <form className="form-grid" onSubmit={submit}>
                {isDemo && (
                  <small className="muted">
                    此为演示预约，请使用测试姓名和测试手机号。
                  </small>
                )}
                <label className="field">
                  手机号 *
                  <Input
                    name="phone"
                    type="tel"
                    placeholder="请输入 11 位手机号"
                    pattern="1[3-9][0-9]{9}"
                    maxLength={11}
                    required
                  />
                </label>
                <label className="field">
                  真实姓名 *
                  <Input
                    name="name"
                    placeholder="请输入姓名"
                    maxLength={40}
                    required
                  />
                </label>
                <label className="field">
                  性别 *
                  <div className="gender-select">
                    <select name="gender">
                      <option>女</option>
                      <option>男</option>
                      <option>不便透露</option>
                    </select>
                  </div>
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    required
                  />
                  <span>
                    我已阅读并同意
                    <a href="/mini/terms?type=terms" target="_blank" rel="noreferrer">使用条款</a>、
                    <a href="/mini/terms?type=booking" target="_blank" rel="noreferrer">预约须知</a>和
                    <a href="/mini/terms?type=privacy" target="_blank" rel="noreferrer">隐私说明</a>
                  </span>
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={photo}
                    onChange={(e) => setPhoto(e.target.checked)}
                  />
                  <span>
                    我同意蜜金在活动中拍摄与我相关的照片视频，并在品牌指定平台发布（可选）。
                  </span>
                </label>
                <Button
                  type="submit"
                  className="mini-submit booking-submit"
                  disabled={busy || !terms}
                >
                  {busy ? '提交中…' : booking?'查看报名结果':'提交预约'}
                </Button>
              </form>
            </>
          ) : (
            !error && <div className="empty">正在加载报名信息…</div>
          )}
        </div>
      </main>
    </div>
  );
}
