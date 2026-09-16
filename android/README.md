# Private Android app

This private 0.2.0 APK combines owner chat, Tomato compute framing, admin
tools, and a foreground BLE bridge. It has no public login, ownership claim,
artifact, or download. Do not publish the APK or its package location.

## Backend warning

`backend/migrations/001_envelop.sql` drops and recreates all Envelop application
state. It is a destructive reset, not an incremental migration. Back up
anything that must survive, verify restoration, and rehearse setup against a
disposable staging project before considering a hosted production project.

Follow the complete [deployment and recovery
runbook](../docs/backend-deployment-recovery.md).

## Clean staging setup

1. Run the destructive schema in the disposable staging project.
2. Open this Android app. It creates or restores its anonymous session and
   displays one SQL command containing its profile UUID.
3. Run that command in the staging Supabase SQL editor.
4. Tap **Check setup**. The app becomes `Tyrone Marhguy`, sole admin, and a
   trusted Tomato bridge.

There is no password, login, claim button, or lockout flow. The private owner
bootstrap is not exposed to anonymous API clients; it runs only with dashboard
database privileges.

The owner identity is the app's local anonymous-auth identity. If the app is
uninstalled, its data is cleared, or that identity is otherwise lost, the
supported recovery is to preserve needed data, perform a clean schema reset,
open the app to create a replacement profile, and bootstrap that UUID from the
dashboard. There is no public password reset or ownership-claim path.

## Bridge boundary

The app may claim the backend lease only after the nearby BLE peer returns the
exact binary `ENVELOP/1` Tomato identity. The one-radio connection and
one-unexpired-lease rules are separate. A checked-in or built app is not proof
that Tomato is currently online. See [bridge
operations](../docs/bridge-operations.md).

## Build

```sh
./package-apk.sh
```

The private artifact is `private-builds/envelop-private-0.2.0.apk`. The build
uses only the Supabase HTTPS URL and public publishable/anon key. Never put a
service-role or secret key in the APK.

Local tests and packaging verify source behavior only. They do not establish a
hosted backend revision or physical Tomato acceptance.
