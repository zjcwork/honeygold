const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../../admin/node_modules/typescript');
const mini=require('../utils/booking-groups');
const compiled=ts.transpileModule(fs.readFileSync(require.resolve('../../admin/lib/booking-groups.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const admin={exports:{}};new Function('exports','module',compiled)(admin.exports,admin);
const now=Date.parse('2026-10-16T14:00:00+08:00');
const row=(status,time='15:00-15:40')=>({status,date:'2026-10-16',time});
for(const {activityStatus,groupBookings} of [mini,admin.exports]){
 assert.equal(activityStatus([row('confirmed')],now),'ongoing');
 assert.equal(activityStatus([row('confirmed','13:00-13:40')],now),'inactive');
 assert.equal(activityStatus([row('cancelled')],now),'inactive');
 assert.equal(activityStatus([row('checked','13:00-13:40')],now),'history');
 assert.equal(activityStatus([row('checked'),row('confirmed')],now),'history');
 assert.equal(activityStatus([row('cancelled'),row('confirmed')],now),'ongoing');
 assert.equal(activityStatus([row('confirmed','13:00-14:00')],now),'inactive');
 const groups=groupBookings([row('checked'),row('checked')].map((r,i)=>({...r,id:String(i),user_id:'u',event_id:'e',booking_group_id:'g'})));
 assert.equal(groups.length,1);assert.equal(activityStatus(groups[0].items,now),'history');
}
console.log('PASS: mini/admin history classification, cancelled and unattended exclusion, range boundaries, multiple experiences grouped');
