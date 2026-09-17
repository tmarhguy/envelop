# Private Android app

This private 0.2.1 APK combines owner chat, Tomato compute framing, admin
tools, and a foreground BLE bridge. It has no public download. Do not publish
the APK or its package location.

## Backend warning

`backend/migrations/001_envelop.sql` drops and recreates all Envelop application
state. It is a destructive reset, not an incremental migration. Back up
anything that must survive, verify restoration, and rehearse setup against a
disposable staging project before considering a hosted production project.

Follow the complete [deployment and recovery
runbook](../docs/backend-deployment-recovery.md).

## Clean staging setup

1. Run the destructive schema in the disposable staging project.
2. In Supabase Auth settings, allow email+password and disable email
   confirmation for this private project.
3. Open this Android app and choose **First-time setup**. It creates an
   anonymous profile and shows one SQL command containing its profile UUID.
4. Run that command once in the staging Supabase SQL editor, then tap
   **Check setup**.
5. Tap **Save recovery password** (or let the app bind
   `owner@envelop.private` / the private operator password). After that,
   reinstalls use **Sign in** — no more SQL.

There is no public ownership-claim flow. `bootstrap_owner` stays dashboard-only
for the first owner on a clean project.

## Recovery

If the sealed local session is cleared, sign in with the recovery email and
password. Do not mint a new anonymous owner or re-run bootstrap unless you are
intentionally replacing the private network owner.

## Bridge boundary

The app may claim the backend lease only after the nearby BLE peer returns the
exact binary `ENVELOP/1` Tomato identity. The one-radio connection and
one-unexpired-lease rules are separate. A checked-in or built app is not proof
that Tomato is currently online. See [bridge
operations](../docs/bridge-operations.md).

## Chat coherence

Tomato chat on Android mirrors the web playground routing for local knowledge,
`/help` examples, and Physical Tomato compute provenance. Virtual browser CPU
execution remains web-only.

## Build

Install JDK 17 and ensure `JAVA_HOME` selects it. Gradle 8.11.1 with the current
Android plugin is not supported by this project on Java 25. On macOS with a
registered JDK 17:


```sh
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

Run focused unit tests with:

```sh
./gradlew :core:testDebugUnitTest :bridge:testDebugUnitTest --no-daemon
```

Package the private app with:

```sh
./package-apk.sh
```

The private artifact is `private-builds/envelop-private-0.2.0.apk`. The build
uses only the Supabase HTTPS URL and public publishable/anon key. Never put a
service-role or secret key in the APK.

Local tests and packaging verify source behavior only. They do not establish a
hosted backend revision or physical Tomato acceptance.
