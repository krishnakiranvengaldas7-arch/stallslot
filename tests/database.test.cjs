const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {readFile,mkdtemp,rm,readdir}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');

test('trial database: permissions, state transitions, privacy and restart durability',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'stallslot-test-'));let db=new PGlite(dir);
 const vendor='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',org='00000000-0000-0000-0000-000000000003',outsider='00000000-0000-0000-0000-000000000004';
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 await db.exec(await readFile('supabase/001_trial.sql','utf8'));
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const event=(await db.query('select id from events')).rows[0].id;
 for(const id of [vendor,other,org,outsider])await db.query('insert into auth.users values($1)',[id]);
 for(const [id,role] of [[vendor,'vendor'],[other,'vendor'],[org,'organiser']])await db.query('insert into event_members values($1,$2,$3)',[event,id,role]);
 async function as(id,sql,args=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'));try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
 const req=(id,stall='B09',name='Test Vendor',business='Test Brand',category='Fashion')=>as(id,'select request_stall($1,$2,$3,$4,$5) as id',[event,stall,name,business,category]);
 const change=(id,b,action,verified=false)=>as(id,'select change_booking($1,$2,$3)',[b,action,verified]);
 const list=async id=>(await as(id,'select trial_stalls($1) as stalls',[event])).rows[0].stalls;
 await t.test('anonymous and uninvited users cannot read or request',async()=>{await assert.rejects(list(null));await assert.rejects(list(outsider));await assert.rejects(req(outsider));});
 await t.test('closed event refuses requests',async()=>{await assert.rejects(req(vendor),/closed/);});
 await db.query('update events set is_open=true');
 await t.test('vendor cannot self-assign organiser role or write directly',async()=>{await assert.rejects(as(vendor,"update event_members set role='organiser'"));await assert.rejects(as(vendor,"update bookings set status='booked'"));await assert.rejects(as(vendor,'select * from bookings'));});
 await t.test('server validates category and contact data',async()=>{await assert.rejects(req(vendor,'B19'));await assert.rejects(req(vendor,'B09','x'));await assert.rejects(req(vendor,'B09','Test','Brand','Food & drink'));await assert.rejects(req(vendor,'B99'));});
 let b;
 await t.test('valid request saved; competing attempt gets no second booking',async()=>{const results=await Promise.allSettled([req(vendor),req(vendor)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);b=results.find(x=>x.status==='fulfilled').value.rows[0].id;await assert.rejects(req(other),/no longer available/);assert.equal((await db.query('select count(*)::int as n from bookings')).rows[0].n,1);});
 await t.test('one active stall per vendor',async()=>{await assert.rejects(req(vendor,'B10'),/already have a request/);});
 await t.test('other vendors see availability but no private details',async()=>{const s=(await list(other)).find(s=>s.id==='B09');assert.equal(s.status,'requested');assert.equal(s.name,'');assert.equal(s.business,'');assert.equal(s.bookingId,null);assert.equal((await list(vendor)).find(s=>s.id==='B09').business,'Test Brand');});
 await t.test('vendors cannot approve, release or confirm their own bookings',async()=>{for(const action of ['approve','release','confirm'])await assert.rejects(change(vendor,b,action,true),/Only this event organiser/);});
 await t.test('another event organiser has no authority here',async()=>{const e2=(await db.query("insert into events(slug,name) values('other','Other') returning id")).rows[0].id;await db.query("insert into event_members values($1,$2,'organiser')",[e2,outsider]);await assert.rejects(change(outsider,b,'approve'),/Only this event organiser/);await assert.rejects(list(outsider));});
 await t.test('confirmation needs approval and explicit verification',async()=>{await assert.rejects(change(org,b,'confirm',true),/invalid/);await change(org,b,'approve');await assert.rejects(change(org,b,'confirm',false),/invalid/);await change(org,b,'confirm',true);assert.equal((await list(vendor)).find(s=>s.id==='B09').status,'booked');});
 await t.test('booked stall cannot be released or reconfirmed',async()=>{await assert.rejects(change(org,b,'release'));await assert.rejects(change(org,b,'confirm',true));});
 await t.test('released booking ID cannot affect a replacement request',async()=>{const first=(await req(other,'B10')).rows[0].id;await change(org,first,'release');const next=(await req(other,'B10')).rows[0].id;assert.notEqual(first,next);await assert.rejects(change(org,first,'approve'));assert.equal((await list(org)).find(s=>s.id==='B10').status,'requested');});
 await t.test('audit records actor and transition',async()=>{const rows=(await db.query('select action,actor_id from booking_audit where booking_id=$1 order by id',[b])).rows;assert.deepEqual(rows.map(r=>r.action),['requested','approve','confirm']);assert.deepEqual(rows.map(r=>r.actor_id),[vendor,org,org]);});
 await t.test('database restart preserves booking and permission checks',async()=>{await db.close();db=new PGlite(dir);assert.equal((await list(vendor)).find(s=>s.id==='B09').status,'booked');await assert.rejects(change(other,b,'release'));});
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
