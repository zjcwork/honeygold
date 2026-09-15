const {baseUrl}=require('../config');
const {resolveUploadedImages}=require('./uploaded-images');
function networkError(error,path){
 const detail=String(error.errMsg||'');
 // Keep request bodies and authorization tokens out of diagnostic logs.
 console.error('[预约接口请求失败]',{url:baseUrl+'/'+path,errMsg:detail});
 let message='网络连接失败，请检查网络后重试';
 if(/url not in domain list|domain.*not.*allowed/i.test(detail))message='接口域名未通过微信校验，请刷新域名配置后重试';
 else if(/ssl|tls|certificate|cert_/i.test(detail))message='HTTPS证书校验失败，请联系活动客服';
 else if(/name_not_resolved|dns|resolve host/i.test(detail))message='域名解析失败，请切换网络后重试';
 else if(/timeout|timed out/i.test(detail))message='请求超时，请重试';
 const result=new Error(message);
 result.detail=detail;
 return result;
}
function request(path,data,method){return new Promise((resolve,reject)=>wx.request({timeout:15000,url:baseUrl+'/'+path,method:method||(data===undefined?'GET':'POST'),data,header:{'content-type':'application/json',Authorization:'Bearer '+(wx.getStorageSync('hg_token')||'')},success:r=>{if(r.statusCode>=200&&r.statusCode<300)resolve(resolveUploadedImages(r.data));else {if(r.statusCode===401)wx.removeStorageSync('hg_token');reject(new Error(r.data.error||'服务暂不可用'))}},fail:e=>reject(networkError(e,path))}))}
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
