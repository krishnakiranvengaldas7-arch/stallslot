import { createClient } from '@supabase/supabase-js';
window.createTrialBackend = (config) => {
 if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url) || !config.publishableKey) throw Error('Trial setup is not complete.');
 if (config.publishableKey.split('.').length===3) {
  try { const payload=JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if(payload.role!=='anon')throw Error(); } catch {throw Error('Only a public anon or publishable key may be used.');}
 }
 if (config.publishableKey.startsWith('sb_secret_')) throw Error('Use a publishable key, never a secret key.');
 const client = createClient(config.url, config.publishableKey);
 let event, role, rows = [];
 async function load() {
  const {data: events,error} = await client.from('events').select('id,name,is_open,is_test,venue,event_date,description,layout_revision').eq('slug',config.eventSlug).limit(1);
  if(error) throw error;
  event=events?.[0];
  if(!event) throw Error('This account has not been invited to the trial. Ask Krishna for access.');
  const {data:{user}}=await client.auth.getUser();
  if(!user) throw Error('Please sign in again.');
  const {data: membership,error: memberError}=await client.from('event_members').select('role').eq('event_id',event.id).eq('user_id',user.id).single();
  if(memberError) throw memberError;
  role=membership.role;
  await refresh();
 }
 async function refresh(){
  const {data,error}=await client.rpc('trial_workspace',{p_event:event.id});
  if(error) throw error;
  event={...event,...data.event};
  rows=data.stalls.map(s=>({...s,size:`${s.width_ft} × ${s.depth_ft} ft`,reference:s.bookingId||''}));
 }
 return {client,load,refresh,event:()=>event,role:()=>role,
 list:()=>rows.map(s=>({...s})),get:id=>{const s=rows.find(s=>s.id===id);if(!s)throw Error('Stall not found.');return {...s};},
 async saveLayout(details,stalls,revision){
  const {error}=await client.rpc('save_trial_layout',{p_event:event.id,p_revision:revision,p_details:details,p_stalls:stalls});
  if(error)throw error;
  try {await refresh();return true;}catch{return false;}
 },
 async request(id,data,revision){
  const {data:bookingId,error}=await client.rpc('request_stall_v2',{p_event:event.id,p_stall:id,p_name:data.name,p_business:data.business,p_category:data.category,p_revision:revision});
  if(error) throw error;
  // The write is committed even if a subsequent network refresh fails.
  const result={id,reference:bookingId};
  const cached=rows.find(s=>s.id===id);
  if(cached)Object.assign(cached,{status:'requested',bookingId,reference:bookingId,name:data.name,business:data.business,category:data.category,mine:true});
  try {await refresh();}catch {result.refreshPending=true;}
  return result;
 },
 async change(id,action,verified=false){
  const booking=rows.find(s=>s.id===id);
  if(!booking?.bookingId)throw Error('Refresh to load the current booking.');
  const {error}=await client.rpc('change_booking',{p_booking:booking.bookingId,p_action:action,p_verified:verified});
  if(error)throw error;
  if(action==='release')Object.assign(booking,{status:'available',bookingId:null,reference:'',business:'',name:'',category:'',mine:false,depositVerified:false});
  else Object.assign(booking,{status:action==='approve'?'held':'booked',depositVerified:action==='confirm'});
  try {await refresh();return true;}catch{return false;}
 }
 };
};
