# Privacy and data lifecycle

Envelop is not documented as end-to-end encrypted. Treat backend content and
operator-visible bridge traffic as readable application data.

## Data held by the backend

The current schema stores anonymous-auth identities, profile names and avatars,
private conversations, messages, device queues, presence heartbeats, bridge
leases, compute jobs and results, bridge grants, and administration state.
Messages remain durable records until an administrator, participant action, or
schema reset removes them. A queued message remains pending until the
end-to-end device acknowledgement is recorded.

Presence is a heartbeat, not message read state. A device queue acknowledgement
means protocol/backend acceptance, not that a person read the message.

## Data crossing the Tomato link

Tomato text is printable ASCII, 1–256 bytes. The BLE protocol uses bounded,
session-local routes and delivery tokens. Cloud UUIDs do not cross the device
link. Disconnecting clears partial frames and ephemeral session mappings.

The exact `ENVELOP/1` response verifies the expected protocol identity. It is
not a claim of cryptographic device attestation or confidentiality.

## Client credentials

Browser and native clients may receive only:

- the Supabase project HTTPS URL; and
- a public publishable/anonymous key.

Service-role keys, secret keys, dashboard credentials, private package URLs,
account UUIDs, BLE identifiers, and administration controls must not be
committed, shipped, or shown in documentation assets.

## Deletion and reset behavior

Leaving the network removes that human's profile and related conversations,
messages, queues, jobs, bridge state, and grants. Administrative removal has a
similar targeted effect. Administrative flush removes conversations, messages,
queues, jobs, leases, and most profiles while preserving the owner and trusted
bridge profiles according to the schema.

Applying `backend/migrations/001_envelop.sql` is broader: it drops and recreates
the Envelop schemas and erases all Envelop application state, including
ownership. It is not an incremental migration and is not a substitute for an
export or backup.

## Backup and recovery

Before a reset, identify which messages, profiles, jobs, and operational records
must survive and take a Supabase/PostgreSQL backup using the hosting provider's
supported process. Keep backups access-controlled and test restoration on a
disposable project. This repository does not currently provide an automated
export, restore, or retention tool.

Owner identity is tied to the private Android app's anonymous auth identity. If
that local identity is lost, the documented recovery is a clean destructive
schema reset followed by dashboard-only owner bootstrap. See the
[deployment and recovery runbook](backend-deployment-recovery.md).

## Screenshots

Use synthetic names and messages. Exclude notifications, account identifiers,
tokens, URLs/keys, BLE and Wi-Fi details, admin controls, private download
locations, and keyboard suggestions. Follow [screenshots.md](screenshots.md).
