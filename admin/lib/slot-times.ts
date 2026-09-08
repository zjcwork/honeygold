export function generateSlotTimes(start:string,end:string,interval:number):string[]{
 const valid=(v:string)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
 if(!valid(start)||!valid(end)||!Number.isInteger(interval)||interval<5||interval>240)throw Error('请填写有效时间，间隔须为5至240分钟');
 const minutes=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));
 const from=minutes(start),to=minutes(end);
 if(from>=to)throw Error('结束时间必须晚于开始时间，不支持跨天');
 const result=[];for(let n=from;n<to;n+=interval)result.push(`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`);
 if(result.length>100)throw Error('一次最多生成100场，请增加间隔或缩短时间段');
 return result;
}
