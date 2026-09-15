const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../pages/index/index.js'),'utf8');
let page,drawComplete,imageExports=[],errors=[],pending=[];
vm.runInNewContext(source,{
 require:()=>({request:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}),
 Page:p=>page=p,console,
 wx:{createCanvasContext:()=>({setFillStyle(){},fillRect(){},draw(clear,callback){drawComplete=callback}}),
 canvasToTempFilePath:options=>imageExports.push(options)}
});
page.data=JSON.parse(JSON.stringify(page.data));
page.setData=function(values,callback){Object.assign(this.data,values);callback?.()};
page.error=e=>errors.push(e.message);
page.data.bookingSiblings=[{id:'booking-a',status:'confirmed'}];
const qr={size:1,data:[1]};
(async()=>{
 const opening=page.openTicketQR();pending.shift().resolve({qr});await opening;
 assert.equal(imageExports.length,0,'Export must wait for drawing to finish');
 drawComplete();imageExports.shift().success({tempFilePath:'ticket.png'});
 assert.equal(page.data.qrImage,'ticket.png');
 page.closeTicketQR();assert.equal(page.data.qrImage,'');
 const second=page.openTicketQR();pending.shift().resolve({qr});await second;drawComplete();
 const staleExport=imageExports.shift();page.closeTicketQR();
 const third=page.openTicketQR();staleExport.success({tempFilePath:'old.png'});
 assert.equal(page.data.qrImage,'','Old imageExports must not populate a reopened dialog');
 pending.shift().resolve({qr});await third;drawComplete();imageExports.shift().fail();
 assert.equal(page.data.ticketQROpen,false);assert.equal(errors.length,1);
 const oldRequest=page.openTicketQR();const staleRequest=pending.shift();page.closeTicketQR();
 const newRequest=page.openTicketQR();staleRequest.reject(new Error('old failure'));await oldRequest;
 assert.equal(page.data.ticketQROpen,true,'Old request failures must not close the current dialog');
 pending.shift().resolve({qr});await newRequest;
 page.closeTicketQR();const count=imageExports.length;drawComplete();assert.equal(imageExports.length,count);
 console.log('PASS: QR image export, close/reopen races, export errors, stale request errors');
})().catch(error=>{console.error(error);process.exitCode=1});
