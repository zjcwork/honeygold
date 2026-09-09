const {baseUrl}=require('../config');
const pending=new Map();
// Native images use a local file so uploaded assets use the same request transport as API data.
function uploadedImage(value){
 const match=typeof value==='string'&&value.match(/^(?:https?:\/\/[^/]+)?\/api\/images\/([a-f0-9-]{36})$/);
 if(!match)return Promise.resolve(value);
 const url=baseUrl.replace(/\/$/,'')+'/images/'+match[1];
 if(pending.has(url))return pending.get(url);
 const task=new Promise((resolve,reject)=>{
  wx.request({url,responseType:'arraybuffer',timeout:8000,success:r=>{
   if(r.statusCode!==200||!r.data||!r.data.byteLength)return reject(new Error('图片接口返回 '+r.statusCode));
   const bytes=new Uint8Array(r.data);
   const extension=bytes[0]===137?'png':bytes[0]===255?'jpg':bytes[0]===71?'gif':bytes[0]===82?'webp':'';
   if(!extension)return reject(new Error('图片格式无效'));
   const filePath=wx.env.USER_DATA_PATH+'/hg-image-'+match[1]+'.'+extension;
   wx.getFileSystemManager().writeFile({filePath,data:r.data,success:()=>resolve(filePath),fail:reject});
  },fail:reject});
 }).catch(e=>{pending.delete(url);console.warn('上传图片加载失败',url,e.errMsg||e.message);return url;});
 pending.set(url,task);return task;
}
async function resolveUploadedImages(data){
 if(Array.isArray(data))return Promise.all(data.map(resolveUploadedImages));
 if(!data||typeof data!=='object')return data;
 const result={...data};
 await Promise.all(Object.keys(result).map(async key=>{
  if(['cover_image','hero_image','contact_qr','image'].includes(key)&&typeof result[key]==='string')result[key]=await uploadedImage(result[key]);
  else if(result[key]&&typeof result[key]==='object')result[key]=await resolveUploadedImages(result[key]);
 }));
 return result;
}
module.exports={resolveUploadedImages};
