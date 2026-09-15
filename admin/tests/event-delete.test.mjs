import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../drizzle/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(file,dir),'utf8'));
 sql.exec(`INSERT INTO users(id,openid,created_at) VALUES('member','openid','2026-01-01');
 INSERT INTO admin_users VALUES('operator','test-operator','hash','salt',1,'2026-01-01');`);
 for(const id of ['target','other','empty']){
  sql.prepare("INSERT INTO events(id,title,subtitle,description,location,start_date,end_date,created_at) VALUES(?,?,'','','','2026-10-15','2026-10-18','2026-01-01')").run(id,id);
  sql.prepare("INSERT INTO participation_modes(id,event_id,name,kind) VALUES(?,?,'参观','direct')").run(id,id);
  sql.prepare("INSERT INTO experiences(id,event_id,name,mode_id) VALUES(?,?,'参观',?)").run(id,id,id);
  sql.prepare("INSERT INTO slots(id,event_id,experience,date,time,capacity,mode_id,experience_id) VALUES(?,?,'参观','2026-10-15','10:00-11:00',20,?,?)").run(id,id,id,id);
  if(id==='empty')continue;
  for(const status of ['checked','cancelled']){
   const bid=id+status;
   sql.prepare("INSERT INTO bookings(id,event_id,slot_id,user_id,name,phone,gender,status,terms_version,code,created_at,booking_group_id) VALUES(?,?,?,'member','姓名','13800000000','女',?,'v1',?,'2026-01-01',?)").run(bid,id,id,status,bid,bid);
   sql.prepare("INSERT INTO notifications(booking_id,status,updated_at) VALUES(?,'sent','2026-01-01')").run(bid);
  }
 }
 const env={DB:{prepare(query){let args=[];return {bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}},async batch(stmts){sql.exec('BEGIN');try{const results=[];for(const stmt of stmts)results.push(await stmt.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}}};
 for(const [token,role,user] of [['admin','admin','operator'],['user','user','member']])sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),user,role,Date.now()+60000);
 const exports={};
 const code=ts.transpileModule(readFileSync(new URL('../lib/service.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>name==='cloudflare:workers'?{env}:{normalizeImageUrls:value=>value},crypto,TextEncoder,URL,Request,Response,console});
 return {sql,async call(body,token='admin'){const r=await exports.handle(new Request('https://example.com/api/admin/events/delete',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}}};
}
test('booked events require explicit boolean force and admin permission',async()=>{
 const s=setup();assert.equal((await s.call({id:'target'})).status,400);assert.equal((await s.call({id:'target',force:'true'})).status,400);assert.equal((await s.call({id:'target',force:true},'user')).status,403);assert.equal(s.sql.prepare("SELECT count(*) n FROM bookings WHERE event_id='target'").get().n,2);
});
test('force removes event dependencies and credentials while preserving other events and members',async()=>{
 const s=setup();assert.equal((await s.call({id:'target',force:true})).status,200);
 for(const table of ['events','participation_modes','experiences','slots']){assert.equal(s.sql.prepare(`SELECT count(*) n FROM ${table} WHERE id='target'`).get().n,0);assert.equal(s.sql.prepare(`SELECT count(*) n FROM ${table} WHERE id='other'`).get().n,1)}
 for(const table of ['bookings','notifications','booking_credentials'])assert.equal(s.sql.prepare(`SELECT count(*) n FROM ${table}`).get().n,2);
 assert.equal(s.sql.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(s.sql.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('empty activity can be deleted normally; carousel association still requires unlinking',async()=>{
 const s=setup();assert.equal((await s.call({id:'empty'})).status,200);
 s.sql.prepare("INSERT INTO content_settings VALUES('home',?)").run(JSON.stringify({slides:[{eventId:'target'}]}));assert.equal((await s.call({id:'target',force:true})).status,400);
 assert.equal(s.sql.prepare("SELECT count(*) n FROM bookings WHERE event_id='target'").get().n,2);
});
test('failure during deletion rolls back bookings, notifications and credentials',async()=>{
 const s=setup();s.sql.exec("CREATE TRIGGER prevent_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'test failure'); END;");assert.notEqual((await s.call({id:'target',force:true})).status,200);
 for(const table of ['bookings','notifications','booking_credentials'])assert.equal(s.sql.prepare(`SELECT count(*) n FROM ${table}`).get().n,4);
 assert.equal(s.sql.prepare("SELECT count(*) n FROM slots WHERE id='target'").get().n,1);
});
