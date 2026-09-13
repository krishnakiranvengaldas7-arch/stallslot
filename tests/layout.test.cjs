const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {readFile,readdir}=require('node:fs/promises');
test('configurable layouts preserve contracts and enforce event-scoped permissions',async t=>{
 const db=new PGlite();
 const org='00000000-0000-0000-0000-000000000001',vendor='00000000-0000-0000-0000-000000000002',outsider='00000000-0000-0000-0000-000000000003';
 try{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.exec(await readFile('supabase/001_trial.sql','utf8'));
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const event=(await db.query('select id from events')).rows[0].id;
 for(const id of [org,vendor,outsider])await db.query('insert into auth.users values($1)',[id]);
 await db.query("insert into event_members values($1,$2,'organiser'),($1,$3,'vendor')",[event,org,vendor]);
 async function as(id,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'));try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
 const details={name:'Custom Market',venue:'Practice hall',event_date:'2026-12-20',description:'Test only'};
 const grid=n=>Array.from({length:n},(_,i)=>({id:'S'+String(i+1).padStart(2,'0'),price:2500,x:2+(i%10)*10,y:2+Math.floor(i/10)*10,width_ft:6,depth_ft:8,power:true,zone:'Main hall',stall_type:'any'}));
 const save=(id,stalls,revision=1,d=details)=>as(id,'select save_trial_layout($1,$2,$3,$4)',[event,revision,JSON.stringify(d),JSON.stringify(stalls)]);
 const workspace=async id=>(await as(id,'select trial_workspace($1) as data',[event])).rows[0].data;
 await t.test('anonymous, vendor and nonmember cannot edit or self-assign access',async()=>{for(const id of [null,vendor,outsider])await assert.rejects(save(id,grid(30)));await assert.rejects(as(vendor,'update stalls set price=1'));await assert.rejects(workspace(outsider));});
 await t.test('original layout migrates without moving B09 or changing its terms',async()=>{const w=await workspace(org),s=w.stalls.find(s=>s.id==='B09');assert.equal(w.stalls.length,24);assert.equal(s.x,6);assert.equal(s.y,43);assert.equal(s.price,3500);assert.equal(s.width_ft,8);});
 await t.test('overlap, duplicate IDs, bounds and empty layouts fail atomically',async()=>{
  const overlap=grid(3);overlap[1].x=overlap[0].x;await assert.rejects(save(org,overlap),/overlap/);
  const duplicate=grid(2);duplicate[1].id=duplicate[0].id;await assert.rejects(save(org,duplicate),/unique/);
  for(const input of [[],grid(101),[{...grid(1)[0],x:93}],[{...grid(1)[0],price:-1}]])await assert.rejects(save(org,input));
  const w=await workspace(org);assert.equal(w.event.layout_revision,1);assert.equal(w.stalls.length,24);
 });
 await t.test('100 stalls save and are visible to vendors with all configured details',async()=>{await save(org,grid(100));const w=await workspace(vendor);assert.equal(w.stalls.length,100);assert.equal(w.event.name,details.name);assert.equal(w.stalls.find(s=>s.id==='S100').width_ft,6);assert.equal(w.stalls[0].power,true);});
 await t.test('stale editor cannot overwrite a newer layout',async()=>{await assert.rejects(save(org,grid(5),1),/layout changed/);assert.equal((await workspace(org)).stalls.length,100);});
 await t.test('unbooked stalls can be removed, count is not fixed at 24',async()=>{await save(org,grid(30),2);assert.equal((await workspace(org)).stalls.length,30);});
 await db.query('update events set is_open=true where id=$1',[event]);
 await t.test('open events refuse layout edits',async()=>{await assert.rejects(save(org,grid(20),3),/Close requests/);});
 const request=(revision,category='Food & drink')=>as(vendor,"select request_stall_v2($1,'S30','Test Vendor','Test Food',$2,$3) as id",[event,category,revision]);
 await t.test('stale vendor review must recheck terms before requesting',async()=>{await assert.rejects(request(2),/layout changed/);});
 let booking;
 await t.test('custom ID and configured category work, independently of electricity',async()=>{booking=(await request(3)).rows[0].id;assert.equal((await workspace(vendor)).stalls.find(s=>s.id==='S30').status,'requested');});
 await db.query('update events set is_open=false where id=$1',[event]);
 await t.test('requested stalls cannot be repriced, moved, resized or removed',async()=>{await assert.rejects(save(org,grid(29),3),/history/);for(const change of [{price:1},{x:85},{width_ft:7},{stall_type:'retail'},{zone:'Changed'}]){const rows=grid(30);Object.assign(rows[29],change);await assert.rejects(save(org,rows,3),/history/);}assert.equal((await workspace(org)).event.layout_revision,3);});
 await t.test('unrelated unbooked changes can save while preserving the booking',async()=>{const rows=grid(30);rows[0].price=4000;await save(org,rows,3);assert.equal((await workspace(org)).stalls.find(s=>s.id==='S30').bookingId,booking);});
 await t.test('retained released history also prevents removal',async()=>{await as(org,"select change_booking($1,'release',false)",[booking]);await assert.rejects(save(org,grid(29),4),/history/);});
 }finally{await db.close();}
});
