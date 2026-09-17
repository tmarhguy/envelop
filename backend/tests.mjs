import { PGlite } from '../tools/testing/node_modules/@electric-sql/pglite/dist/index.js';
import { pgcrypto } from '../tools/testing/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;`);
await db.exec(await readFile(new URL('./migrations/001_envelop.sql', import.meta.url), 'utf8'));

const ids = {
  owner: '10000000-0000-0000-0000-000000000001',
  alice: '20000000-0000-0000-0000-000000000002',
  bob: '30000000-0000-0000-0000-000000000003',
  mac: '40000000-0000-0000-0000-000000000004',
  tomato: '00000000-0000-0000-0000-000000000001',
};
const instance = '50000000-0000-0000-0000-000000000005';
const nonce = '60000000-0000-0000-0000-000000000006';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${ids[user]}',false)`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
async function rpc(name, args = []) {
  const parameters = args.map((_, index) => `$${index + 1}`).join(',');
  return (await db.query(`select * from public.${name}(${parameters})`, args)).rows;
}

for (const name of ['owner', 'alice', 'bob', 'mac']) {
  await as(name, () => rpc('create_profile', [name, 2]));
}

await test('one clean schema keeps owner bootstrap private', async () => {
  assert.equal(
    (await db.query("select to_regprocedure('public.bootstrap_private_owner()') as value")).rows[0].value,
    null,
  );
  assert.equal(
    (await db.query("select to_regprocedure('envelop_private.bootstrap_owner(uuid)') as value")).rows[0].value,
    'envelop_private.bootstrap_owner(uuid)',
  );
  for (const oldFunction of [
    'public.android_claim_owner(text,integer,text)',
    'public.android_create_profile(text,integer,text)',
  ]) {
    assert.equal(
      (await db.query('select to_regprocedure($1) as value', [oldFunction])).rows[0].value,
      null,
    );
  }
  for (const oldTable of ['owner_credentials', 'owner_login_attempts', 'owner_global_guard']) {
    assert.equal(
      (await db.query('select to_regclass($1) as value', [`envelop_private.${oldTable}`])).rows[0].value,
      null,
    );
  }
  await as('alice', () =>
    assert.rejects(
      db.query('select envelop_private.bootstrap_owner($1)', [ids.alice]),
      /permission denied/,
    ));
});

await test('dashboard bootstrap makes the selected profile Tyrone owner and bridge', async () => {
  const profile = (await db.query(
    'select * from envelop_private.bootstrap_owner($1)',
    [ids.owner],
  )).rows[0];
  assert.equal(profile.id, ids.owner);
  assert.equal(profile.display_name, 'Tyrone Marhguy');
  assert.equal(profile.verified, true);
  assert.equal(profile.pinned, true);
  assert.equal((await as('owner', () => rpc('am_i_admin')))[0].am_i_admin, true);
  assert.equal(
    (await db.query(
      'select count(*)::int as count from envelop_private.bridge_grants where device_id=$1 and user_id=$2',
      [ids.tomato, ids.owner],
    )).rows[0].count,
    1,
  );
});

await test('dashboard bootstrap is idempotent and rejects a second profile', async () => {
  assert.equal(
    (await db.query(
      'select * from envelop_private.bootstrap_owner($1)',
      [ids.owner],
    )).rows[0].id,
    ids.owner,
  );
  await assert.rejects(
    db.query('select envelop_private.bootstrap_owner($1)', [ids.alice]),
    /already initialized/,
  );
});

await test('reserved owner name cannot be taken through normal profile editing', async () => {
  await as('alice', () =>
    assert.rejects(
      rpc('update_profile_name', [' \tTYRONE \n Marhguy ']),
      /reserved/,
    ));
});

let conversation;
let tomatoConversation;
let queuedMessage;
await test('DM messages are private and nonce-idempotent', async () => {
  conversation = (await as('alice', () => rpc('get_or_create_dm', [ids.bob])))[0].get_or_create_dm;
  const first = await as('alice', () =>
    rpc('send_message', [conversation, 'hello', nonce]));
  const retry = await as('alice', () =>
    rpc('send_message', [conversation, 'hello', nonce]));
  assert.equal(first[0].id, retry[0].id);
  await as('mac', async () => {
    assert.equal((await db.query('select * from public.messages')).rows.length, 0);
    await assert.rejects(
      rpc('send_message', [conversation, 'intrude', instance]),
      /Not a conversation member/,
    );
  });
});

await test('Tomato messages queue and require a trusted live bridge', async () => {
  tomatoConversation = (await as('alice', () =>
    rpc('get_or_create_dm', [ids.tomato])))[0].get_or_create_dm;
  queuedMessage = (await as('alice', () =>
    rpc('send_message', [tomatoConversation, 'Hello', instance])))[0];
  assert.equal(
    (await db.query('select state from public.device_queue where message_id=$1', [queuedMessage.id])).rows[0].state,
    'queued',
  );
  await as('alice', () =>
    assert.rejects(rpc('claim_bridge', [ids.tomato, instance]), /not provisioned/));
  await as('owner', () => rpc('claim_bridge', [ids.tomato, instance]));
  assert.equal(
    (await as('owner', () => rpc('bridge_pending', [ids.tomato, instance]))).length,
    1,
  );
  await as('owner', () =>
    rpc('ack_device_message', [ids.tomato, instance, queuedMessage.id]));
  await as('owner', () => rpc('release_bridge', [ids.tomato, instance]));
});

await test('compute jobs remain lease-scoped and durable', async () => {
  const hex = '01 01 05 00 00 00 2A 30 00';
  const job = (await as('alice', () =>
    rpc('enqueue_compute_job', [ids.tomato, tomatoConversation, hex])))[0];
  await as('owner', () => rpc('claim_bridge', [ids.tomato, instance]));
  assert.equal(
    (await as('owner', () =>
      rpc('bridge_compute_pending', [ids.tomato, instance])))[0].job_id,
    job.id,
  );
  await as('owner', () =>
    rpc('bridge_claim_compute_job', [job.id, ids.tomato, instance]));
  await db.query(
    "update public.compute_jobs set updated_at=now()-interval '2 minutes' where id=$1",
    [job.id],
  );
  assert.equal(
    (await as('owner', () =>
      rpc('bridge_compute_pending', [ids.tomato, instance]))).length,
    0,
    'claimed hardware work must never be offered for automatic replay',
  );
  await as('owner', () =>
    assert.rejects(
      rpc('bridge_claim_compute_job', [job.id, ids.tomato, instance]),
      /job unavailable/,
    ));
  assert.equal(
    (await as('alice', () => rpc('cancel_compute_job', [job.id])))[0].status,
    'claimed',
    'a claimed hardware job must remain ambiguous rather than become virtual-safe',
  );
  const done = (await as('owner', () =>
    rpc('bridge_finish_compute_job', [
      job.id,
      ids.tomato,
      instance,
      '42',
      null,
    ])))[0];
  assert.equal(done.status, 'completed');
  assert.equal((await as('alice', () => rpc('my_compute_job', [job.id])))[0].result_text, '42');
  await as('owner', () => rpc('release_bridge', [ids.tomato, instance]));
});

await test('owner manages verification and trusted bridge access', async () => {
  await as('owner', () => rpc('admin_set_verified', [ids.mac, true]));
  await as('owner', () => rpc('owner_set_trusted_bridge', [ids.mac, true]));
  assert.deepEqual(
    (await as('owner', () => rpc('owner_trusted_bridge_ids')))
      .map(row => row.owner_trusted_bridge_ids),
    [ids.owner, ids.mac].sort(),
  );
  await as('mac', () => rpc('claim_bridge', [ids.tomato, instance]));
  await as('mac', () => rpc('release_bridge', [ids.tomato, instance]));
});

await test('non-owner admin calls and owner self-removal are rejected', async () => {
  await as('alice', () => assert.rejects(rpc('admin_flush'), /Admin required/));
  await as('owner', () =>
    assert.rejects(rpc('admin_remove_profile', [ids.owner]), /Invalid profile/));
  await as('owner', () =>
    assert.rejects(rpc('admin_set_verified', [ids.owner, false]), /reserved/));
});

await test('owner can remove another profile and its conversations', async () => {
  await as('owner', () => rpc('admin_remove_profile', [ids.bob]));
  assert.equal(
    (await db.query('select count(*)::int as count from public.profiles where id=$1', [ids.bob])).rows[0].count,
    0,
  );
  assert.equal(
    (await db.query('select count(*)::int as count from public.conversations where id=$1', [conversation])).rows[0].count,
    0,
  );
});

await test('flush preserves owner, Tomato, and trusted Mac bridge', async () => {
  await as('owner', () => rpc('heartbeat'));
  await as('alice', () => rpc('heartbeat'));
  await as('owner', () => rpc('admin_flush'));
  assert.deepEqual(
    (await db.query('select id from public.profiles order by id')).rows.map(row => row.id),
    [ids.tomato, ids.owner, ids.mac].sort(),
  );
  assert.deepEqual(
    (await db.query(
      'select user_id from envelop_private.bridge_grants order by user_id',
    )).rows.map(row => row.user_id),
    [ids.owner, ids.mac].sort(),
  );
  for (const table of ['compute_jobs', 'device_queue', 'messages', 'conversations', 'device_bridges']) {
    assert.equal(
      (await db.query(`select count(*)::int as count from public.${table}`)).rows[0].count,
      0,
    );
  }
});

console.log(`${passed} backend integration tests passed on PostgreSQL/PGlite`);
await db.close();
