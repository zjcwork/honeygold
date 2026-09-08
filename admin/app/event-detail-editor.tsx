'use client';
export default function EventDetailEditor({event}:{event:any}) {
  return <label className="field">详情页活动介绍
    <textarea name="description" defaultValue={event.description || ''} rows={8} maxLength={8000} required placeholder="请输入活动介绍文字" />
  </label>;
}
