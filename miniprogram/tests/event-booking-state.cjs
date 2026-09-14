const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'../pages/index/index.js'),'utf8');
let page,rows=[],failure=null,prepared=0,errors=[];
vm.runInNewContext(source,{require:()=>({login:async()=>{},request:async path=>{assert.equal(path,'bookings');if(failure)throw failure;return rows}}),Page:p=>page=p,console,Date,setTimeout,clearTimeout,setInterval,clearInterval,wx:{hideLoading(){}}});
page.data=JSON.parse(JSON.stringify(page.data));
page.setData=function(values){Object.assign(this.data,values)};
page.prepareSlots=()=>prepared++;
page.error=e=>errors.push(e.message);
page.data.view='detail';page.data.event={id:'event-a',status:'published',slots:[{id:'slot'}]};
(async()=>{
 for(const status of ['confirmed','checked']){
  rows=[{event_id:'event-a',status}];await page.refreshEventBooking();assert.equal(page.data.eventBooked,true);await page.reserve();assert.equal(prepared,0);
 }
 rows=[{event_id:'event-a',status:'cancelled'},{event_id:'event-b',status:'confirmed'}];
 await page.refreshEventBooking();assert.equal(page.data.eventBooked,false);await page.reserve();assert.equal(prepared,1);assert.equal(page.data.sheet,'slots');
 // A reservation made after the detail was loaded must still block the sheet.
 page.data.sheet='';rows=[{event_id:'event-a',status:'confirmed'}];await page.reserve();assert.equal(prepared,1);assert.equal(page.data.eventBooked,true);assert.equal(page.data.sheet,'');
 rows=[];await page.refreshEventBooking();failure=new Error('offline');await page.reserve();assert.equal(prepared,1);assert.equal(page.data.bookingStatusLoading,false);assert.equal(errors.pop(),'offline');
 failure=null;rows=[{event_id:'event-a',status:'confirmed'}];page.onShow();await new Promise(resolve=>setImmediate(resolve));assert.equal(page.data.eventBooked,true);
 console.log('PASS: confirmed/checked disabled, cancelled/other events allowed, fresh booking blocked, request failure guarded, return refresh');
})().catch(error=>{console.error(error);process.exitCode=1});
