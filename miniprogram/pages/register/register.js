const {request,login}=require('../../utils/api');
Page({
data:{event:null,slotId:'',selectedType:'',selectedDate:'',selectedTime:'',isFull:false,name:'',phone:'',gender:'女',genders:['女','男','不便透露'],terms:false,photo:false,demo:true,busy:false,sheet:'',errorMessage:''},
async onLoad(options){try{await login();const [event,config]=await Promise.all([request('events/'+encodeURIComponent(options.event||'')),request('config')]);const slot=event.slots.find(s=>s.id===options.slot);if(!slot)throw Error('场次不存在，请返回重新选择');this.setData({event,demo:config.demo,slotId:slot.id,selectedType:slot.experience,selectedDate:slot.date,selectedTime:slot.time,isFull:slot.booked>=slot.capacity})}catch(e){this.setData({errorMessage:e.message||'报名信息加载失败'})}},
navigationBack(){if(getCurrentPages().length>1)wx.navigateBack();else wx.reLaunch({url:'/pages/index/index'})},
error(e){wx.showToast({title:e.message||'操作失败，请重试',icon:'none',duration:3000})},
input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value})},
genderChange(e){this.setData({gender:this.data.genders[Number(e.detail.value)]})},
consent(e){this.setData({terms:e.detail.value.includes('terms'),photo:e.detail.value.includes('photo')})},
async getPhone(e){if(!e.detail.code)return this.error(new Error('需同意授权手机号后完成预约'));try{const r=await request('phone',{code:e.detail.code});this.setData({phone:r.phone})}catch(err){this.error(err)}},
async submit(){if(this.data.busy)return;const d=this.data;if(!d.terms)return this.error(new Error('请阅读并同意预约条款'));if(!d.name.trim()||!/^1[3-9]\d{9}$/.test(d.phone))return this.error(new Error('请填写姓名和有效手机号'));this.setData({busy:true});try{const booking=await request('bookings',{slotId:d.slotId,name:d.name.trim(),phone:d.phone,gender:d.gender,terms:d.terms,photoConsent:d.photo});const pages=getCurrentPages();const previous=pages[pages.length-2];wx.navigateBack({success:()=>{if(previous&&previous.showBooking)previous.showBooking(booking);wx.showToast({title:booking.status==='waitlisted'?'候补提交成功':'预约成功',icon:'success'})}})}catch(e){this.error(e)}finally{this.setData({busy:false})}},
showTerms(){this.setData({sheet:'terms'})},closeSheet(){this.setData({sheet:''})},noop(){}
});
