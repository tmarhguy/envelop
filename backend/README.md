# Supabase deployment

Envelop has one current schema: `migrations/001_envelop.sql`.

## Destructive reset

The file starts by dropping the `envelop_private` and `public` schemas with
`cascade`. It erases and recreates Envelop profiles, conversations, messages,
queues, jobs, leases, grants, ownership, policies, and related state. It is not
an incremental migration and must not be run as a routine production update.

Before applying it to any non-disposable project:

1. take a provider-supported PostgreSQL/Supabase backup or export of everything
   that must survive;
2. verify and rehearse restoration into a separate disposable project;
3. rehearse the schema and owner bootstrap in staging;
4. record client, backend, bridge, and firmware revisions; and
5. define rollback and acceptance criteria.

This repository does not provide an automated backup, restore, or in-place
upgrade tool. See the full [deployment and recovery
runbook](../docs/backend-deployment-recovery.md).

## Clean staging setup

1. In a disposable Supabase project, enable anonymous sign-ins.
2. Run the entire `migrations/001_envelop.sql` file in the SQL editor.
3. Open the private Android app. It creates an ordinary anonymous profile and
   displays one SQL command containing its generated UUID.
4. Run that command in the dashboard SQL editor, then tap **Check setup**.

The dashboard-only `envelop_private.bootstrap_owner(uuid)` function turns that
profile into `Tyrone Marhguy`, the sole admin, and a trusted Tomato BLE bridge.
It is not granted to anonymous API clients.

After bootstrap, the private Android app binds a recovery email/password to the
same auth user. Later installs sign in with that password instead of creating a
new anonymous identity. A service-role key must never be shipped as a recovery
mechanism.

## Client configuration

Clients receive only the project HTTPS URL and public publishable/anonymous key:

```sh
export ENVELOP_SUPABASE_URL='https://YOUR_PROJECT.supabase.co'
export ENVELOP_SUPABASE_KEY='YOUR_PUBLIC_KEY'
```

Never embed a secret or service-role key in an app or screenshot.

## Schema behavior

- Anonymous name-only profiles and private two-person chats
- Idempotent sends and durable Tomato queues
- One unexpired authenticated Tomato bridge lease
- Durable hardware compute jobs
- Human presence and pinned profiles
- Owner verification, user removal, trusted bridge controls, and network flush
- RLS and RPC-only writes

`admin_flush` is destructive to conversations, messages, queues, jobs, leases,
and most profiles, but differs from applying the schema: it preserves the
owner and trusted bridge profiles according to current SQL. Neither operation
is a backup.

Run local backend contract tests from the repository root:

```sh
node backend/tests.mjs
```

These tests do not contact or establish the revision of a hosted Supabase
project unless separately configured and explicitly authorized. Do not run
live smoke tests by default because they create accounts and data.
