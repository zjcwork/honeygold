const {request}=require('./api');

function authorize(templateId){
  return new Promise((resolve,reject)=>{
    if(typeof wx.requestSubscribeMessage!=='function')return reject(new Error('请升级微信后订阅活动通知'));
    // Keep the native request in the user's tap call stack.
    wx.requestSubscribeMessage({tmplIds:[templateId],success:result=>resolve(result[templateId]),fail:error=>{
      if(Number(error.errCode)===20004)resolve('reject');
      else reject(new Error('暂时无法打开订阅授权，请稍后重试'));
    }});
  });
}

async function subscribeActivity(page,bookings){
  if(page.data.subscribing)return;
  const booking=(bookings||[]).find(b=>b&&b.status==='confirmed');
  if(!booking)return page.error(new Error('当前没有可订阅的有效报名'));
  const templateId=getApp().globalData.config?.subscriptionTemplateId;
  if(!templateId)return page.error(new Error('活动通知尚未开通，请在报名信息中查看最新状态'));
  const key=templateId+':'+(booking.booking_group_id||booking.id);
  page.setData({subscribing:true});
  try{
    // A failed save can be retried without spending a second native authorization.
    if(page.subscriptionGrant!==key){
      const result=await authorize(templateId);
      if(result!=='accept'){
        if(result==='reject')wx.showModal({title:'未开启活动通知',content:'如需接收通知，请在设置中开启订阅消息，然后再次点击订阅活动通知。',confirmText:'打开设置',success:r=>{if(r.confirm)wx.openSetting({withSubscriptions:true})}});
        else page.error(new Error('该通知模板暂不可订阅，请稍后重试'));
        return;
      }
      page.subscriptionGrant=key;
    }
    const result=await request('bookings/'+encodeURIComponent(booking.id)+'/subscribe',{templateId});
    const messages={sent:'活动通知已发送，请查看微信服务通知',pending:'订阅已保存，通知等待发送',sending:'活动通知发送中，请稍后查看微信',failed:'通知发送失败，请联系活动客服',unknown:'通知发送结果待确认，请先查看微信服务通知'};
    const message=messages[result.status]||'订阅已保存';
    page.setData({successNote:message});
    wx.showToast({title:message,icon:'none',duration:3000});
  }catch(error){
    page.error(new Error(page.subscriptionGrant===key?'订阅保存失败，请再次点击重试':error.message));
  }finally{
    page.setData({subscribing:false});
  }
}

module.exports={subscribeActivity};
