# Platforms and support

| Surface | Audience | Current role | Distribution |
|---|---|---|---|
| Browser | General public | Chat and browser-only Virtual Tomato execution | Web deployment; exact deployed revision must be checked separately |
| macOS 14 | Operator/tester | Chat client and nearby Tomato BLE bridge | Source-supported package, version 0.2.0 |
| Android | Private owner/operator | Chat, administration, compute framing, and foreground BLE bridge | Private source-supported APK, version 0.2.0; no public artifact |
| Tomato OS | Tomato device | On-device Envelop UI and compute endpoint | Maintained in the Tomato repository |

## Browser

The browser is Envelop's general desktop and mobile client. Browser chat can
queue messages for physical Tomato. Its Virtual Tomato execution is a separate,
visibly labeled path and is not a bridge. Offline compute can run virtually
immediately. After a hardware attempt, virtual fallback remains a separate
action and is offered only for a confirmed terminal non-result.

Repository implementation does not prove which revision is currently deployed.

## macOS

The Swift package targets macOS 14. The app is an operator bridge and test chat
client. It connects to Tomato's Nordic UART service, verifies `ENVELOP/1`, and
then claims the backend bridge lease. It is not a general requirement for web
users.

## Android

The Android app is maintained for the private owner. It includes no public
login or ownership-claim flow and must not be advertised or linked as a public
download. Its package contains only a public Supabase URL and
publishable/anonymous key; bridge permission comes from backend provisioning,
not a secret embedded in the APK.

## Status vocabulary

“Implemented,” “verified,” “hardware-accepted,” “deployed,” and “online” are
not interchangeable. The canonical definitions and current evidence are in
[status.md](status.md).
