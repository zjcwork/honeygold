import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup({send={errcode:0},token=true}={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE notifications(booking_id TEXT PRIMARY KEY,status TEXT,last_error TEXT,updated_at TEXT);
 CREATE TABLE bookings(id TEXT PRIMARY KEY,user_id TEXT,event_id TEXT,slot_id TEXT,booking_group_id TEXT,status TEXT,name TEXT,phone TEXT,experience_ids TEXT);
 CREATE TABLE slots(id TEXT,date TEXT,time TEXT,mode_id TEXT);
 CREATE TABLE events(id TEXT,title TEXT);
 CREATE TABLE users(id TEXT,openid TEXT);
 CREATE TABLE experiences(id TEXT,name TEXT);
 CREATE TABLE participation_modes(id TEXT,name TEXT);
 CREATE TABLE sessions(hash TEXT,user_id TEXT,role TEXT,expires_at INTEGER);
 INSERT INTO events VALUES('event','活动');INSERT INTO users VALUES('user','openid');
 INSERT INTO slots VALUES('later','2027-10-10','12:00-13:00','mode'),('early','2027-10-10','10:00-11:00','mode');
 INSERT INTO participation_modes VALUES('mode','体验');
 INSERT INTO bookings VALUES('a','user','event','later','group','confirmed','姓名','13800000000','[]'),('b','user','event','early','group','confirmed','姓名','13800000000','[]'),('other','someone','event','early','other','confirmed','姓名','13800000000','[]'),('cancelled','user','event','early','old','cancelled','姓名','13800000000','[]');`);
 sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update('test-token').digest('hex'),'user','user',Date.now()+60000);
 const env={WECHAT_APP_ID:'app',WECHAT_APP_SECRET:'test-secret',WECHAT_SUBSCRIBE_TEMPLATE_ID:'template',WECHAT_SUBSCRIBE_FIELDS:JSON.stringify({thing1:'title',time2:'datetime'}),DB:{prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...values){args=values;return this},async all(){return {results:stmt.all(...args)}},async first(){return stmt.get(...args)||null},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}}}}};
 const sent=[];
 const fetch=async(url,options)=>{if(url.includes('/token?'))return {json:async()=>token?{access_token:'test-token'}:{errcode:40001}};sent.push(JSON.parse(options.body));if(send instanceof Error)throw send;return {json:async()=>send}};
 function load(file,dependencies={}){const exports={};const code=ts.transpileModule(readFileSync(new URL('../lib/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,require:name=>name==='cloudflare:workers'?{env}:dependencies[name]||{},fetch,crypto,TextEncoder,URL,URLSearchParams,AbortSignal,Request,Response,console});return exports;}
 const notices=load('notifications.ts');const service=load('service.ts',{'./notifications':notices,'./image-urls':load('image-urls.ts')});
 return {sql,env,sent,...notices,async call(id,body={templateId:'template'}){const r=await service.handle(new Request('https://example.com/api/bookings/'+id+'/subscribe',{method:'POST',headers:{authorization:'Bearer test-token','content-type':'application/json'},body:JSON.stringify(body)}));return {code:r.status,body:await r.json()}}};
}
test('API combines multiple experience rows and repeated requests into one send',async()=>{
 const s=setup();assert.equal((await s.call('a')).body.status,'sent');assert.equal((await s.call('b')).body.status,'sent');assert.equal((await s.call('a')).body.status,'sent');assert.equal(s.sent.length,1);assert.equal(s.sent[0].page,'pages/index/index?booking=b');assert.equal(s.sent[0].data.time2.value,'2027-10-10 10:00');assert.equal(s.sql.prepare('SELECT count(*) AS n FROM notifications').get().n,1);
});
test('ownership, cancelled bookings and changed template rejected',async()=>{
 const s=setup();assert.equal((await s.call('other')).code,400);assert.equal((await s.call('cancelled')).code,400);assert.equal((await s.call('a',{templateId:'stale'})).code,400);assert.equal(s.sent.length,0);
});
test('concurrent subscription calls claim only one delivery',async()=>{
 const s=setup();await Promise.all([s.call('a'),s.call('b')]);assert.equal(s.sent.length,1);
});
test('network uncertainty never triggers automatic resend',async()=>{
 const s=setup({send:new Error('network disconnected')});assert.equal((await s.call('a')).body.status,'unknown');await s.call('a');await s.flushNotices();assert.equal(s.sent.length,1);
});
test('malformed WeChat response is uncertain rather than retryable',async()=>{
 const s=setup({send:{}});assert.equal((await s.call('a')).body.status,'unknown');
});
test('explicit rejection and token failure return truthful status',async()=>{
 const s=setup({send:{errcode:43101,errmsg:'user refuse'}});assert.equal((await s.call('a')).body.status,'failed');await s.call('a');assert.equal(s.sent.length,1);const pending=setup({token:false});assert.equal((await pending.call('a')).body.status,'pending');assert.equal(pending.sent.length,0);
});
test('invalid field mapping and missing credentials disable authorization',()=>{
 const s=setup();assert.equal(s.subscriptionReady(),true);for(const fields of ['null','[]','{"thing1":"wrong"}','{"bogus":"title"}']){s.env.WECHAT_SUBSCRIBE_FIELDS=fields;assert.equal(s.subscriptionReady(),false)}s.env.WECHAT_SUBSCRIBE_FIELDS='{"thing1":"title"}';s.env.WECHAT_APP_SECRET='';assert.equal(s.subscriptionReady(),false);
});
