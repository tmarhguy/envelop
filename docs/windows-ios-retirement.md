# Windows and iOS native-client retirement

## Decision

Windows and iOS native clients are retired. Their source/project and packaging
paths were removed, and no current package is supported or distributed.
Historical logs and repository history may still mention them.

The browser is Envelop's general desktop and mobile client. Native code is kept
only where it serves the nearby Tomato bridge:

- macOS 14 is the operator bridge and test chat client;
- Android 0.2.0 is the private owner/administration/bridge app.

## Why

The product needs one nearby process with BLE access, not a public native app
for every operating system. Maintaining Windows and iOS clients would duplicate
chat surfaces without changing Tomato's one-radio and one-active-lease
constraints. Browser chat keeps public access independent of private bridge
distribution.

This is a support and scope decision, not a claim that either platform is
technically incapable of a future bridge.

## Documentation and artifact rules

- Do not list Windows or iOS as supported clients.
- Do not restore links to removed ZIP, app, project, or package paths.
- Do not infer support from an old screenshot, log, tag, or build script.
- Describe the Android APK as private and macOS as operator/test software.
- Direct ordinary Windows and iOS users to the browser.

Reintroducing a native platform requires a current owner, source and package
policy, tests, privacy review, documented bridge role, and an update to
[status.md](status.md). Repository history alone is not a supported release.
