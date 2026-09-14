export function groupBookings(rows:any[]):any[]{
 const groups=new Map<string,any>();
 for(const row of rows){const key=JSON.stringify([row.user_id,row.event_id,row.booking_group_id||row.id]);let group=groups.get(key);if(!group){group={...row,items:[]};groups.set(key,group)}group.items.push(row)}
 return [...groups.values()];
}

export function activityStatus(items:any[], now=Date.now()){
  if(items.some(item=>item.status==='checked'))return 'history';
  if(items.some(item=>item.status==='confirmed' && new Date(`${item.date}T${String(item.time).split('-').pop()}:00+08:00`).getTime()>now))return 'ongoing';
  return 'inactive';
}
