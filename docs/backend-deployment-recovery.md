# Backend deployment and recovery

## Destructive schema warning

`backend/migrations/001_envelop.sql` is the sole current schema. Despite its
path, it is not an incremental migration: it drops the `envelop_private` and
`public` schemas with `cascade`, recreates them, and deletes Envelop profiles,
conversations, messages, queues, jobs, leases, grants, ownership, and related
state.

Do not apply it to a hosted project as a routine update.

## Before deployment

1. Confirm the target project and record its current deployed schema revision.
2. Use a disposable staging Supabase project first; never rehearse against
   production.
3. Enable anonymous sign-ins in staging.
4. Back up all data that must survive using a provider-supported
   PostgreSQL/Supabase backup or export process.
5. Verify that the backup is readable and rehearse restoration into a separate
   disposable project.
6. Record the existing owner identity, client configuration, bridge/firmware
   revisions, and rollback decision point.
7. Confirm clients contain only the project HTTPS URL and public
   publishable/anonymous key.

The repository has no automated backup or in-place upgrade tool. A schema-only
copy is not a backup of application data or auth identities.

## Clean staging setup

1. Run the complete `backend/migrations/001_envelop.sql` in the Supabase SQL
   editor.
2. Confirm the expected tables, RLS policies, grants, and RPCs exist.
3. Open the private Android app so it creates or restores an ordinary anonymous
   profile and displays its bootstrap SQL.
4. In the dashboard SQL editor, run the displayed
   `envelop_private.bootstrap_owner(uuid)` call.
5. In the app, check setup. The selected profile becomes the sole admin and a
   trusted Tomato bridge.
6. Run local contract checks against repository source. Run any hosted smoke
   test only when explicitly authorized; such tests create accounts and data.
7. Complete a separately authorized physical acceptance test before describing
   hardware as available.

`bootstrap_owner` is dashboard-only and is not granted to anonymous API
clients. Do not expose the profile UUID or bootstrap statement in screenshots
or public logs.

## Production change policy

Because the current schema is destructive, a production change requires an
explicit maintenance window, tested backup, tested restore path, staging
rehearsal, and acceptance criteria. Preserve the old project or backup until
the replacement passes verification. If retaining existing records is
required, write and test a purpose-built data migration; this repository does
not currently contain one.

## Owner identity loss

The private Android owner is an anonymous-auth identity stored locally. If the
app is uninstalled, its data is cleared, or that identity otherwise cannot be
restored, the documented supported recovery is:

1. preserve/export any data that must survive;
2. create or select the clean recovery target;
3. apply the destructive schema;
4. open the private Android app to create a new profile;
5. bootstrap that UUID from the dashboard; and
6. re-run contract and physical acceptance checks as appropriate.

Do not try to claim ownership through a public API or ship a service-role key
to bypass recovery.

## Restore and rollback

If staging or production acceptance fails, stop bridge operation and client
rollout. Restore into a separate project where possible, verify row counts and
ownership before switching client configuration, and keep physical/virtual
result provenance intact. A database restore cannot recover an Android
anonymous-auth identity that was not preserved by the platform/provider
backup.

Record unresolved deployed-revision and recovery-rehearsal status in
[status.md](status.md). Source and local tests alone do not establish hosted
deployment state.
