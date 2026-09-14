// Layout is measured before mounting the canvas, so long names and extra experiences expand the image.
function layoutTicket({booking,experiences,qr},measure){
 const commands=[],width=600,pad=30,inner=48;
 function text(value,x,y,max,size=22,color='#1A1A1A',line=32){let cursor=y;for(const paragraph of String(value||'').split('\n')){let row='';for(const char of paragraph){if(row&&measure(row+char,size)>max){commands.push({kind:'text',text:row,x,y:cursor,size,color});cursor+=line;row=''}row+=char}commands.push({kind:'text',text:row,x,y:cursor,size,color});cursor+=line}return cursor}
 let y=text((booking.subtitle||'HONEY GOLD CLUB')+' 活动预约',pad,52,540,42,'#9E9E9E',54);
 y+=22;const hintY=y;y=text('抵达活动现场，\n须出示专属活动二维码',pad,y,340,24,'#9E9E9E',34);
 commands.push({kind:'image',src:'/assets/ui/qr-entry.png',x:450,y:hintY-22,width:86,height:86});y=Math.max(y,hintY+78)+16;
 commands.push({kind:'line',x:pad,y,width:540});y+=52;y=text('报名场次',pad,y,540,28,'#1A1A1A',40);
 const cardTop=y-10;y+=28;const cardIndex=commands.length;
 y=text(booking.title,inner,y,504,28,'#1A1A1A',38);y+=12;
 if(booking.participation_name)y=text(booking.participation_name,inner,y,504,24,'#1A1A1A',34);
 for(const experience of experiences){y+=12;y=text(experience.experienceName||experience.experience_label||experience.experience,inner,y,504,24,'#1A1A1A',34);y=text(experience.date+'  '+experience.time,inner,y,504,21,'#9E9E9E',30);y=text(experience.location,inner,y,504,21,'#9E9E9E',30)}
 y+=20;y=text('报名信息',inner,y,504,27,'#1A1A1A',38);y=text('姓名 '+booking.name,inner,y,504,22,'#9E9E9E',32);
 if(booking.birthday)y=text('生日 '+booking.birthday,inner,y,504,22,'#9E9E9E',32);
 y=text('手机号 '+(booking.maskedPhone||String(booking.phone||'').replace(/(\d{3})\d{4}(\d{4})/,'$1****$2')),inner,y,504,22,'#9E9E9E',32);
 y+=12;commands.splice(cardIndex,0,{kind:'card',x:pad,y:cardTop,width:540,height:y-cardTop});
 y+=40;const cell=Math.max(1,Math.floor(300/(qr.size+8))),qrWidth=cell*(qr.size+8);
 commands.push({kind:'qr',x:Math.floor((width-qrWidth)/2),y,cell,qr});y+=qrWidth+34;
 commands.push({kind:'text',text:'活动入场二维码',x:300,y,size:22,color:'#9E9E9E',center:true});
 return {width,height:y+40,commands};
}
function drawTicket(ctx,plan){ctx.setFillStyle('#FFFFFF');ctx.fillRect(0,0,plan.width,plan.height);for(const c of plan.commands){
 if(c.kind==='text'){ctx.setTextAlign(c.center?'center':'left');ctx.setFontSize(c.size);ctx.setFillStyle(c.color);ctx.fillText(c.text,c.x,c.y)}
 if(c.kind==='image')ctx.drawImage(c.src,c.x,c.y,c.width,c.height);
 if(c.kind==='line'){ctx.setStrokeStyle('#E7E7E7');ctx.setLineWidth(1);ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x+c.width,c.y);ctx.stroke()}
 if(c.kind==='card'){const {x,y,width:w,height:h}=c,r=12;ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.setFillStyle('#FFFFFF');ctx.fill();ctx.setStrokeStyle('#ECECEC');ctx.setLineWidth(1);ctx.stroke()}
 if(c.kind==='qr'){ctx.setFillStyle('#1A4D3F');c.qr.data.forEach((value,i)=>{if(value)ctx.fillRect(c.x+(i%c.qr.size+4)*c.cell,c.y+(Math.floor(i/c.qr.size)+4)*c.cell,c.cell,c.cell)})}
 }}
module.exports={layoutTicket,drawTicket};
