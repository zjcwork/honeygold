const fs=require('fs'),vm=require('vm'),assert=require('assert');let page;
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../pages/index/index.js'),'utf8'),{require:()=>({}),Page:p=>page=p,console,Date,setTimeout,clearTimeout,setInterval,clearInterval});
page.data=JSON.parse(JSON.stringify(page.data));page.setData=function(v){Object.assign(this.data,v)};
page.data.event={participation_modes:[{id:'visit',name:'参观',kind:'direct',enabled:1,items:[]},{id:'workshop',name:'工坊',kind:'experiences',enabled:1,items:[{id:'a',name:'A'},{id:'b',name:'B'}]}],slots:[{id:'v',mode_id:'visit',date:'2099-01-01',time:'13:00-13:40',capacity:1,booked:0},{id:'s',mode_id:'workshop',date:'2099-01-01',time:'13:00-13:40',capacity:1,booked:0},{id:'t',mode_id:'workshop',date:'2099-01-01',time:'14:00-14:40',capacity:1,booked:1}]};

const ev=(index,id)=>({currentTarget:{dataset:{experience:index,id}}});
page.data.event.slots[1].experience_id='a';page.data.event.slots[2].experience_id='b';page.data.event.slots[2].booked=0;
page.data.event.slots.push({...page.data.event.slots[1],id:'legacy-shared',experience_id:null});
page.prepareSlots();page.participationChange({detail:{value:2}});
page.chooseCardDate({currentTarget:{dataset:{index:0,value:'2099-01-01'}}});
assert.equal(page.data.experienceChoices[0].times.map(x=>x.id).join(','),'s');
assert.equal(page.data.experienceChoices[1].times.map(x=>x.id).join(','),'t');
page.chooseExperienceTime(ev(0,'t'));assert(!page.data.experienceChoices[0].slotId);
page.chooseExperienceTime(ev(0,'s'));page.chooseExperienceTime(ev(1,'t'));assert(page.data.selectionReady);
assert.equal(page.data.selectedSlotIds.join(','),'s,t');
console.log('PASS: experience-specific times, cross-experience selection rejected, multi-experience booking preserved');
