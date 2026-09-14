import { PGlite } from '../tools/testing/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
await db.exec(await readFile(new URL('./migrations/001_envelop.sql',import.meta.url),'utf8'));
const ids = {alice:'10000000-0000-0000-0000-000000000001',bob:'20000000-0000-0000-0000-000000000002',eve:'30000000-0000-0000-0000-000000000003',tomato:'00000000-0000-0000-0000-000000000001'};
let passed=0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function as(user, fn) {
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${ids[user]}',false)`);
 try { return await fn(); } finally { await db.exec('reset role'); }
}
async function rpc(name,args=[]) {
 return (await db.query(`select * from public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows;
}
for(const name of ['alice','bob','eve']) await as(name,()=>rpc('create_profile',[name,2]));
let dm,tdm,message;
const nonce='40000000-0000-0000-0000-000000000004', instance='50000000-0000-0000-0000-000000000005', other='60000000-0000-0000-0000-000000000006';
await test('canonical DM is the same for both participants',async()=>{
 dm=(await as('alice',()=>rpc('get_or_create_dm',[ids.bob])))[0].get_or_create_dm;
 assert.equal((await as('bob',()=>rpc('get_or_create_dm',[ids.alice])))[0].get_or_create_dm,dm);
});
await test('message persists, nonce retry creates one row',async()=>{
 const first=await as('alice',()=>rpc('send_message',[dm,'hello Bob',nonce]));
 const retry=await as('alice',()=>rpc('send_message',[dm,'hello Bob',nonce]));
 assert.equal(first[0].id,retry[0].id);
 assert.equal((await as('bob',()=>db.query('select * from messages'))).rows.length,1);
});
await test('nonce reuse with changed body is rejected',()=>as('alice',()=>assert.rejects(rpc('send_message',[dm,'changed',nonce]),/Nonce reused/)));
await test('outsider cannot read or write private messages',()=>as('eve',async()=>{
 assert.equal((await db.query('select * from messages')).rows.length,0);
 await assert.rejects(rpc('send_message',[dm,'intrude',other]),/Not a conversation member/);
 await assert.rejects(db.query('insert into messages(conversation_id,sender_id,body,client_nonce) values($1,$2,$3,$4)',[dm,ids.tomato,'spoof',other]),/permission denied/);
}));
await test('device profile cannot be forged or edited',()=>as('eve',async()=>{
 await assert.rejects(db.query('update profiles set verified=true where id=$1',[ids.eve]),/permission denied/);
 await assert.rejects(db.query('insert into device_bridges values($1,$2,$3,now(),now())',[ids.tomato,ids.eve,other]),/permission denied/);
}));
await test('offline Tomato messages queue durably',async()=>{
 tdm=(await as('alice',()=>rpc('get_or_create_dm',[ids.tomato])))[0].get_or_create_dm;
 message=(await as('alice',()=>rpc('send_message',[tdm,'Are you there?',other])))[0];
 assert.equal((await db.query('select state from device_queue where message_id=$1',[message.id])).rows[0].state,'queued');
});
await test('Tomato rejects non-ASCII and overlong text',()=>as('alice',async()=>{
 await assert.rejects(rpc('send_message',[tdm,'emoji 😀',instance]),/ASCII/);
 await assert.rejects(rpc('send_message',[tdm,'x'.repeat(257),instance]),/check constraint/);
}));
await test('unprovisioned bridge cannot claim identity',()=>as('eve',()=>assert.rejects(rpc('claim_bridge',[ids.tomato,other]),/not provisioned/)));
await db.query('insert into envelop_private.bridge_grants values($1,$2),($1,$3)',[ids.tomato,ids.alice,ids.bob]);
await test('lease is exclusive across users and instances',async()=>{
 await as('alice',()=>rpc('claim_bridge',[ids.tomato,instance]));
 await as('bob',()=>assert.rejects(rpc('claim_bridge',[ids.tomato,other]),/already leased/));
 await as('alice',()=>assert.rejects(rpc('claim_bridge',[ids.tomato,other]),/already leased/));
});
await test('active bridge fetches queue, stale instance cannot ACK',async()=>{
 assert.equal((await as('alice',()=>rpc('bridge_pending',[ids.tomato,instance]))).length,1);
 await as('alice',()=>assert.rejects(rpc('ack_device_message',[ids.tomato,other,message.id]),/lease lost/));
});
await test('queue remains until explicit ACK, ACK is idempotent',async()=>{
 await as('alice',()=>rpc('ack_device_message',[ids.tomato,instance,message.id]));
 await as('alice',()=>rpc('ack_device_message',[ids.tomato,instance,message.id]));
 assert.equal((await as('alice',()=>rpc('bridge_pending',[ids.tomato,instance]))).length,0);
});
await test('device reply has Tomato identity and is idempotent',async()=>{
 const first=await as('alice',()=>rpc('send_as_device',[ids.tomato,instance,tdm,'yes :)',nonce]));
 const second=await as('alice',()=>rpc('send_as_device',[ids.tomato,instance,tdm,'yes :)',nonce]));
 assert.equal(first[0].sender_id,ids.tomato);assert.equal(first[0].id,second[0].id);
 await as('alice',()=>assert.rejects(rpc('send_as_device',[ids.tomato,instance,dm,'wrong chat',other]),/not a conversation member/));
});
await test('expiry permits handoff and fences old bridge',async()=>{
 await db.query("update device_bridges set expires_at=now()-interval '1 second'");
 await as('bob',()=>rpc('claim_bridge',[ids.tomato,other]));
 await as('alice',()=>assert.rejects(rpc('send_as_device',[ids.tomato,instance,tdm,'stale',other]),/lease lost/));
 await as('alice',()=>rpc('release_bridge',[ids.tomato,instance]));
 assert.equal((await db.query('select bridge_user_id from device_bridges')).rows[0].bridge_user_id,ids.bob);
 await as('bob',()=>rpc('release_bridge',[ids.tomato,other]));
 assert.equal((await db.query('select * from device_bridges')).rows.length,0);
});
console.log(`${passed} backend integration tests passed on PostgreSQL/PGlite`);
await db.close();
