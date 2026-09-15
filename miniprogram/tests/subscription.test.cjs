const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup({result='accept',request,fail}={}){
 const calls=[],modals=[],toasts=[];let auths=0;
 const context={module:{exports:{}},require:()=>({request:async(...args)=>{calls.push(args);return request?request(...args):{status:'sent'}}}),getApp:()=>({globalData:{config:{subscriptionTemplateId:'template'}}}),wx:{requestSubscribeMessage(options){auths++;if(fail)options.fail(fail);else options.success({template:result});},showModal:m=>modals.push(m),showToast:m=>toasts.push(m),openSetting:o=>calls.push(['settings',o])}};
 vm.runInNewContext(fs.readFileSync(new URL('../utils/subscription.js',`file://${__filename}`),'utf8'),context);
 const page={data:{subscribing:false},errors:[],setData(data){Object.assign(this.data,data)},error(e){this.errors.push(e.message)}};
 return {subscribe:context.module.exports.subscribeActivity,page,calls,modals,toasts,auths:()=>auths};
}
const bookings=[{id:'one',booking_group_id:'group',status:'confirmed'},{id:'two',booking_group_id:'group',status:'confirmed'}];
test('one grant saves one activity, and sends booking link target',async()=>{
 const s=setup();await s.subscribe(s.page,bookings);assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'bookings/one/subscribe');assert.equal(s.auths(),1);assert.match(s.page.data.successNote,/已发送/);assert.equal(s.page.data.subscribing,false);
});
test('lock stays held throughout asynchronous persistence',async()=>{
 let finish;const s=setup({request:()=>new Promise(r=>finish=r)});const first=s.subscribe(s.page,bookings);await Promise.resolve();assert.equal(s.page.data.subscribing,true);await s.subscribe(s.page,bookings);assert.equal(s.auths(),1);assert.equal(s.calls.length,1);finish({status:'pending'});await first;assert.match(s.page.data.successNote,/等待发送/);
});
test('failed persistence retries without a second authorization',async()=>{
 let count=0;const s=setup({request:()=>{if(!count++)throw Error('offline');return {status:'sent'}}});await s.subscribe(s.page,bookings);assert.match(s.page.errors[0],/再次点击/);await s.subscribe(s.page,bookings);assert.equal(s.auths(),1);assert.equal(s.calls.length,2);
});
for(const options of [{result:'reject'},{fail:{errCode:20004}}])test('denial offers subscription settings and does not save',async()=>{
 const s=setup(options);await s.subscribe(s.page,bookings);assert.equal(s.calls.length,0);assert.equal(s.modals.length,1);s.modals[0].success({confirm:true});assert.equal(s.calls[0][1].withSubscriptions,true);assert.equal(s.page.data.subscribing,false);
});
test('banned template and cancelled booking cannot save subscriptions',async()=>{
 const s=setup({result:'ban'});await s.subscribe(s.page,bookings);assert.equal(s.calls.length,0);assert.equal(s.page.errors.length,1);await s.subscribe(s.page,[{id:'old',status:'cancelled'}]);assert.equal(s.auths(),1);
});
test('uncertain delivery is never reported as sent',async()=>{
 const s=setup({request:()=>({status:'unknown'})});await s.subscribe(s.page,bookings);assert.match(s.page.data.successNote,/待确认/);assert.doesNotMatch(s.page.data.successNote,/已发送/);
});
