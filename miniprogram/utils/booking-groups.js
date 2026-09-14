function groupBookings(rows){const groups=new Map();for(const row of rows){const key=JSON.stringify([row.user_id,row.event_id,row.booking_group_id||row.id]);let group=groups.get(key);if(!group){group={...row,items:[]};groups.set(key,group)}group.items.push(row)}return [...groups.values()].map(group=>{const statuses=[...new Set(group.items.map(x=>x.status))];return {...group,label:statuses.length===1?group.label:'多场次预约'}})}
function experienceRows(bookings){return bookings.flatMap(booking=>{let items=[];try{items=JSON.parse(booking.experience_items||'[]')}catch(e){}if(!Array.isArray(items)||!items.length)return [{...booking,entryKey:booking.id,experienceName:booking.experience_label||booking.experience}];return items.map(item=>({...booking,entryKey:booking.id+':'+item.id,experienceName:item.name}))})}
function activityStatus(items, now=Date.now()){
  if(items.some(item=>item.status==='checked'))return 'history';
  if(items.some(item=>item.status==='confirmed' && new Date(`${item.date}T${String(item.time).split('-').pop()}:00+08:00`).getTime()>now))return 'ongoing';
  return 'inactive';
}
module.exports={groupBookings,experienceRows,activityStatus};
