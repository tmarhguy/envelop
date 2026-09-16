# Envelop architecture

Envelop surrounds Tomato with a browser client, durable backend, nearby native
bridge, and a compact binary device protocol.

## Canonical path

```text
person → Envelop web app → backend queue → nearby verified bridge
       → Envelop in Tomato OS → Tomato CPU → labeled reply
```

The browser and backend do not talk directly to the FPGA. The bridge must be
physically near Tomato, connect to its nRF8001 Nordic UART service, and verify
the exact binary `ENVELOP/1` identity before claiming a backend lease. The
Tomato-side Envelop application and compute endpoint live in the Tomato
repository; this repository owns the web, backend, bridges, and shared framing.

## Messaging path

1. A human sends a printable ASCII message through the web or native test
   client.
2. The backend stores the message and creates a durable device queue entry.
3. The active leased bridge assigns a session-local route and delivery token,
   then forwards `CHAT_MESSAGE`.
4. Tomato deduplicates retries and returns `MESSAGE_ACK`.
5. Only then does the bridge mark the backend queue row acknowledged.

A backend or protocol acknowledgement is delivery, not a human read receipt.
Retries reuse the same token, but exactly-once rendering is not guaranteed
across reconnect or power loss.

For Tomato replies, the bridge uses a stable nonce and returns
`MESSAGE_ACK` only after `send_as_device` succeeds. Cloud UUIDs never cross the
device link.

## Session and presence boundaries

The radio allows one physical connection. Separately, the backend permits one
unexpired authenticated bridge lease. A disconnect clears partial frames,
routes, tokens, pending writes, and bridge-local state. Reconnection creates a
new bridge instance and begins with `CONTACT_RESET`.

Human presence heartbeats, the Tomato bridge lease, message delivery, and read
state are separate concepts. “Hardware online” requires a current authenticated
lease after identity verification; source code alone is not online evidence.

## Compute path

Hardware compute is durable:

```text
browser request → backend compute job → leased bridge → COMPUTE_JOB
                → Tomato CPU → COMPUTE_RESULT → completed backend job
```

A result may be labeled **Physical Tomato** or **Hardware Tomato** only after
the backend job is completed through that hardware path. A claimed or timed-out
job has an unknown hardware outcome. It must not be silently rerun virtually.

The browser's **Virtual Tomato** is a separate terminal fallback. It executes
immediately in the browser, is visibly labeled, never enters the hardware
queue, and is never presented as FPGA output.

## Evidence boundary

Shared vectors establish codec agreement. Local backend tests establish schema
contracts. Simulations establish Tomato-side behavior under their test setup.
None alone proves that the hosted backend, nearby bridge, and programmed FPGA
are online with matching revisions. See [status](status.md) for current claims
and [documentation authority](documentation-policy.md) for the source order.
