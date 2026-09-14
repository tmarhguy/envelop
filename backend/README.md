# Supabase deployment

0. Copy `.env.example` to `.env` (repo root, gitignored, `chmod 600`) and
   fill in the project URL, publishable key, and secret key. The secret
   key is for the dashboard / local scripts ONLY — it must never appear
   in any app, plist, or commit. If a secret is ever pasted anywhere
   shared, rotate it in the dashboard (API keys section) immediately.

1. Create a Supabase project. Enable anonymous sign-ins in Auth.
2. Apply `migrations/001_envelop.sql` once through the SQL editor or your migration runner.
3. Supply only the project HTTPS URL and public publishable/anon key to the app:

```sh
export ENVELOP_SUPABASE_URL='https://YOUR_PROJECT.supabase.co'
export ENVELOP_SUPABASE_KEY='YOUR_PUBLIC_KEY'
```

For a bundled launch use `EnvelopSupabaseURL` and `EnvelopSupabaseKey` in the app's Info.plist. LaunchServices does not reliably inherit terminal environment. Do not put service-role keys in clients or commit project credentials. Auth sessions are saved in Keychain, scoped by project URL. No email/password is requested.

4. Enter Envelop on the bridge computer. After checking its profile ID, provision bridge permission from the server SQL editor:

```sql
insert into envelop_private.bridge_grants(device_id,user_id)
values ('00000000-0000-0000-0000-000000000001','REPLACE_WITH_BRIDGE_PROFILE_UUID');
```

The current hardware HELLO is not cryptographic proof of physical possession. Granting a lease to any caller who claims to have seen HELLO would allow impersonation of Tomato. Until device attestation exists, only explicitly provisioned accounts can bridge. Provisioning authorizes the account to act as Tomato; keep that trust narrow. Removing a grant prevents renewal; an existing lease expires within 30 seconds.

All writes go through authenticated RPCs. Direct table mutation is revoked. RLS permits humans to read only their own conversations and messages. Canonically ordered participant columns enforce exactly two members; `conversation_members` is a security-invoker compatibility view. Queue retrieval is a protected lease-scoped RPC. Device sends are lease-scoped and idempotent by nonce. Queue entries become ACKED only through the acknowledgment RPC. No manual cleanup is needed for stale presence: readers compare `expires_at` with current time.

The Apple client currently fetches the latest 20 messages, up to 50 search matches, and polls every three seconds. Realtime, recents ordering, and full search pagination remain unfinished. This migration has not been executed against a live project in this workspace.

Official references: [anonymous authentication](https://supabase.com/docs/guides/auth/auth-anonymous), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions).
