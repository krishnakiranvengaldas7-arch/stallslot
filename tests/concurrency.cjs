// Separate PostgreSQL connections are needed to exercise real row-lock contention.
const assert=require('node:assert/strict');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
(async()=>{
 const {default:EmbeddedPostgres}=await import('embedded-postgres');
 const root=await mkdtemp(join(tmpdir(),'stallslot-pg-'));
 const server=new EmbeddedPostgres({databaseDir:join(root,'data'),port:55439,user:'postgres',password:'local-test-only',persistent:false,onLog:()=>{},onError:()=>{}});
 let admin,a,b;
 try{
 await server.initialise();await server.start();admin=server.getPgClient();await admin.connect();
 await admin.query("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await admin.query(await readFile('supabase/001_trial.sql','utf8'));
 const event=(await admin.query('update events set is_open=true returning id')).rows[0].id;
 const users=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'];
 for(const id of users){await admin.query('insert into auth.users values($1)',[id]);await admin.query("insert into event_members values($1,$2,'vendor')",[event,id]);}
 a=server.getPgClient();b=server.getPgClient();await a.connect();await b.connect();
 for(const [i,client] of [a,b].entries()){await client.query("select set_config('request.jwt.claim.sub',$1,false)",[users[i]]);await client.query('set role authenticated');}
 await a.query('begin');
 const sql="select request_stall($1,'B09','Test Vendor','Test Brand','Fashion')";
 await a.query(sql,[event]);
 const pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
 let settled=false;const competitor=b.query(sql,[event]).then(()=>{settled=true;return 'unexpected-success';},error=>{settled=true;return error;});
 // Observe PostgreSQL reporting that the second connection is actually waiting on a lock.
 let blocked=false;
 for(let n=0;n<100;n++){
  const row=(await admin.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
  if(row?.wait_event_type==='Lock'){blocked=true;break;}
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(blocked,true,'second connection must wait on the stall lock');assert.equal(settled,false);
 await a.query('commit');const result=await competitor;assert.equal(result.code,'23505');
 const count=(await admin.query("select count(*)::int as count from bookings where status<>'released'")).rows[0].count;
 assert.equal(count,1);console.log('PASS: two PostgreSQL connections contended for B09; loser waited, then was rejected; exactly one active booking.');
 }finally{await a?.end();await b?.end();await admin?.end();await server.stop().catch(()=>{});await rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
