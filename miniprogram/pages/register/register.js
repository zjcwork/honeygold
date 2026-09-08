const {request,login}=require('../../utils/api');
Page({
data:{booking:null,successOpen:false,subscribing:false,event:null,slotId:'',selectedType:'',selectedDate:'',selectedTime:'',isFull:false,name:'',phone:'',gender:'女',genders:['女','男','不便透露'],terms:false,photo:false,demo:true,busy:false,sheet:'',errorMessage:''},
async onLoad(options){try{await login();const [event,config]=await Promise.all([request('events/'+encodeURIComponent(options.event||'')),request('config')]);getApp().globalData.config=config;const identity=await request('auth/me');this.setData({phone:identity.phone||''});const slot=event.slots.find(s=>s.id===options.slot);if(!slot)throw Error('场次不存在，请返回重新选择');this.setData({event,demo:config.demo,slotId:slot.id,selectedType:slot.experience,selectedDate:slot.date,selectedTime:slot.time,isFull:slot.booked>=slot.capacity})}catch(e){this.setData({errorMessage:e.message||'报名信息加载失败'})}},
navigationBack(){if(this.data.booking)return this.viewBooking();if(getCurrentPages().length>1)wx.navigateBack();else wx.reLaunch({url:'/pages/index/index'})},
error(e){wx.showToast({title:e.message||'操作失败，请重试',icon:'none',duration:3000})},
input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value})},
genderChange(e){this.setData({gender:this.data.genders[Number(e.detail.value)]})},
consent(e){this.setData({terms:e.detail.value.includes('terms'),photo:e.detail.value.includes('photo')})},
async getPhone(e){if(!e.detail.code)return this.error(new Error('需同意授权手机号后完成预约'));try{const r=await request('phone',{code:e.detail.code});this.setData({phone:r.phone})}catch(err){this.error(err)}},
async submit(){if(this.data.booking){this.setData({successOpen:true});return}if(this.data.busy)return;const d=this.data;if(!d.terms)return this.error(new Error('请阅读并同意预约条款'));if(!d.name.trim()||!/^1[3-9]\d{9}$/.test(d.phone))return this.error(new Error('请填写姓名和有效手机号'));this.setData({busy:true});try{const booking=await request('bookings',{slotId:d.slotId,name:d.name.trim(),phone:d.phone,gender:d.gender,terms:d.terms,photoConsent:d.photo});this.setData({booking,successOpen:true})}catch(e){this.error(e)}finally{this.setData({busy:false})}},
closeSuccess(){this.setData({successOpen:false})},
viewBooking(){const booking=this.data.booking;if(!booking)return;const pages=getCurrentPages(),previous=pages[pages.length-2];if(previous&&previous.showBooking){wx.navigateBack({success:()=>previous.showBooking(booking)})}else wx.reLaunch({url:'/pages/index/index?booking='+encodeURIComponent(booking.id)})},
subscribeSuccess(){if(this.data.subscribing)return;const id=getApp().globalData.config?.subscriptionTemplateId;if(!id)return this.error(new Error('订阅通知尚未配置，可在报名信息中查看状态'));this.setData({subscribing:true});wx.requestSubscribeMessage({tmplIds:[id],success:async r=>{if(r[id]==='accept'){try{await request('bookings/'+this.data.booking.id+'/subscribe',{});wx.showToast({title:'订阅授权成功',icon:'none'})}catch(e){this.error(e)}}else this.error(new Error('未开启订阅，可随时查看报名信息'))},fail:e=>this.error(new Error(e.errMsg)),complete:()=>this.setData({subscribing:false})})},
showTerms(){this.setData({sheet:'terms'})},closeSheet(){this.setData({sheet:''})},noop(){}
});
