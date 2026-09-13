(function(root){
'use strict';
function createDemoBackend(){
 const model=root.StallSlot.createModel();let role='vendor',mine=null;
 const metadata=s=>{const i=Number(s.id.slice(1))-1,r=Math.floor(i/6),c=i%6;return {...s,x:r===1?6:r===2?86:10+c*14,y:r===0?8:r===3?84:24+c*10,width_ft:s.power?10:8,depth_ft:s.power?10:8,stall_type:s.power?'food':'retail',mine:s.id===mine,bookingId:s.reference,locked:s.status!=='available'};};
 return {
  load:async()=>{},refresh:async()=>{},role:()=>role,
  setRole:value=>{if(!['vendor','organiser'].includes(value))throw Error('Choose a demo role.');role=value;},
  event:()=>({name:'The Courtyard Market',venue:'Hyderabad · sample courtyard',event_date:null,description:'Independent labels, handmade finds and good food. Explore this sample market and find a space that fits your business.',is_test:true,is_open:true,layout_revision:1}),
  list:()=>model.list().map(metadata),get:id=>metadata(model.get(id)),
  request:async(id,data)=>{if(role!=='vendor')throw Error('Switch to the vendor demo to request a stall.');if(mine)throw Error('You already have a request for this event.');const result=model.request(id,data);mine=id;return {reference:result.reference,refreshPending:false};},
  change:async(id,action,verified)=>{if(role!=='organiser')throw Error('Switch to the organiser demo to manage bookings.');if(action==='approve')model.approve(id);else if(action==='confirm')model.confirm(id,verified);else if(action==='release'){model.release(id);if(mine===id)mine=null;}else throw Error('Unknown booking action.');return true;}
 };
}
root.createDemoBackend=createDemoBackend;
if(typeof module!=='undefined')module.exports={createDemoBackend};
})(typeof globalThis!=='undefined'?globalThis:this);
