const {request}=require('../../utils/api');
const titles={terms:'使用条款',booking:'预约须知',privacy:'隐私说明'};
Page({data:{title:'使用条款',body:'',loading:true,error:false},onLoad(options){this.kind=Object.prototype.hasOwnProperty.call(titles,options.type)?options.type:'terms';this.setData({title:titles[this.kind]});this.loadContent()},async loadContent(){this.setData({loading:true,error:false});try{const content=await request('legal');this.setData({body:content[this.kind]||'暂无内容'})}catch(e){this.setData({error:true})}finally{this.setData({loading:false})}},back(){wx.navigateBack()}});
