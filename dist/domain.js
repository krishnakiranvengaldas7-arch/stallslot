(function(root){
'use strict';
const money=n=>'₹'+n.toLocaleString('en-IN');
function initialStalls(){
 const seeded={2:['booked','Thread & Co.','Aarav','Fashion'],5:['booked','Clay Stories','Diya','Art & craft'],8:['requested','Paper People','Neha','Art & craft'],11:['held','Little Loom','Riya','Fashion'],15:['booked','Loop Jewellery','Sara','Accessories'],19:['booked','Dosa District','Kiran','Food & drink'],22:['requested','Brew Society','Dev','Food & drink']};
 return Array.from({length:24},(_,i)=>{let n=i+1,s=seeded[n];return {id:'B'+String(n).padStart(2,'0'),row:Math.floor(i/6),col:i%6,status:s?s[0]:'available',business:s?s[1]:'',name:s?s[2]:'',category:s?s[3]:'',price:n>18?4500:(i%6===0||i%6===5?4000:3500),size:n>18?'10 × 10 ft':'8 × 8 ft',zone:n>18?'South · food lane':n<=6?'North edge':n<=12?'West edge':'East edge',power:n>18,depositVerified:s?.[0]==='booked',reference:s?'DEMO-'+String(n).padStart(3,'0'):''};});
}
function createModel(){let stalls=initialStalls();let counter=100;
 function get(id){const s=stalls.find(s=>s.id===id);if(!s)throw Error('Choose an existing stall.');return s;}
 return {list:()=>stalls.map(s=>({...s})),get:id=>({...get(id)}),
 request(id,data){const s=get(id);if(s.status!=='available')throw Error('This stall is no longer available. Please choose another.');const name=String(data.name||'').trim(),business=String(data.business||'').trim(),category=String(data.category||'');if(name.length<2||name.length>60||business.length<2||business.length>80)throw Error('Enter a contact name and business name of at least two characters.');const allowed=s.power?['Food & drink']:['Fashion','Accessories','Art & craft','Home & lifestyle'];if(!allowed.includes(category))throw Error('Choose a category allowed in this lane.');Object.assign(s,{name,business,category,status:'requested',reference:'DEMO-'+(++counter),depositVerified:false});return {...s};},
 approve(id){const s=get(id);if(s.status!=='requested')throw Error('Only a pending request can be approved.');s.status='held';return {...s};},
 confirm(id,verified){const s=get(id);if(s.status!=='held')throw Error('Approve the request before confirming its booking.');if(verified!==true)throw Error('Verify the deposit before confirming.');s.status='booked';s.depositVerified=true;return {...s};},
 release(id){const s=get(id);if(!['requested','held'].includes(s.status))throw Error('Only pending requests and holds can be released.');Object.assign(s,{status:'available',business:'',name:'',category:'',reference:'',depositVerified:false});return {...s};}
 };
}
root.StallSlot={createModel,money};if(typeof module!=='undefined')module.exports=root.StallSlot;
})(typeof globalThis!=='undefined'?globalThis:this);
