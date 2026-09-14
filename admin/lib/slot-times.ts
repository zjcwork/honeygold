const valid=(v:string)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function validateSlotTime(time:string):string{
 if(valid(time))return time; // Existing single-time slots remain usable.
 const parts=typeof time==='string'?time.split('-'):[];
 if(parts.length!==2||!parts.every(valid)||minutes(parts[1])<=minutes(parts[0]))throw Error('请填写有效时间范围，结束时间须晚于开始时间，不支持跨天');
 return time;
}
export function generateSlotTimes(start:string,end:string,interval:number,duration?:number):string[]{
 if(!valid(start)||!valid(end)||!Number.isInteger(interval)||interval<5||interval>240)throw Error('请填写有效时间，间隔须为5至240分钟');
 const from=minutes(start),to=minutes(end);
 if(from>=to)throw Error('结束时间必须晚于开始时间，不支持跨天');
 if(duration!==undefined&&(!Number.isInteger(duration)||duration<1||duration>interval))throw Error('场次时长须为正整数，且不能超过开始时间间隔');
 const result=[];for(let n=from;n<to;n+=interval){if(duration!==undefined&&n+duration>to)break;result.push(duration===undefined?clock(n):`${clock(n)}-${clock(n+duration)}`)}
 if(!result.length)throw Error('时间范围不足一个场次');
 if(result.length>100)throw Error('一次最多生成100场，请增加间隔或缩短时间段');
 return result;
}
