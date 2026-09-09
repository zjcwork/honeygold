const {baseUrl}=require('../config');
const {resolveUploadedImages}=require('./uploaded-images');
function request(path,data,method){return new Promise((resolve,reject)=>wx.request({timeout:15000,url:baseUrl+'/'+path,method:method||(data===undefined?'GET':'POST'),data,header:{'content-type':'application/json',Authorization:'Bearer '+(wx.getStorageSync('hg_token')||'')},success:r=>{if(r.statusCode>=200&&r.statusCode<300)resolve(resolveUploadedImages(r.data));else {if(r.statusCode===401)wx.removeStorageSync('hg_token');reject(new Error(r.data.error||'服务暂不可用'))}},fail:e=>reject(new Error((e.errMsg||'').includes('timeout')?'请求超时，请重试':'连接失败，请确认预约服务已启动'))}))}
let loginTask;
async function login(){
 if(loginTask)return loginTask;
 loginTask=(async()=>{
  if(wx.getStorageSync('hg_token')){
   try{await request('auth/me');return}catch(e){if(wx.getStorageSync('hg_token'))throw e}
  }
  const code=await new Promise((resolve,reject)=>wx.login({success:r=>r.code?resolve(r.code):reject(new Error('微信登录失败，请重试')),fail:reject}));
  const result=await request('auth/wechat',{code});
  wx.setStorageSync('hg_token',result.token);
 })();
 try{return await loginTask}finally{loginTask=null}
}
module.exports={request,login};
