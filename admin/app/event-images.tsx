'use client';
import ImageUpload from './image-upload';
export default function EventImages({event}:{event:any}){
 return <section style={{display:'grid',gap:16}}><ImageUpload name="cover_image" label="活动封面图" initialValue={event.cover_image||''}/><ImageUpload name="hero_image" label="详情顶部图" initialValue={event.hero_image||''}/></section>;
}
