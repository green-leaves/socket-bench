# FIX Protocol Support — Design

**Status:** Approved (design phase)
**Date:** 2026-06-20

## Goal

Let SocketBench act as a FIX **initiator**: log on to a remote FIX **acceptor**,
send application messages, and watch the response stream — alongside the
existing WebSocket / STOMP / RSocket protocols.

## Problem & core constraint

SocketBench is a 100% static, browser-only app (served from GitHub Pages, no
backend). Browsers can only open **WebSocket, HTTP(S), or WebRTC** connections —
never raw TCP. Classic FIX is a raw-TCP session protocol, and a FIX acceptor
listens on a TCP port. Therefore the browser **cannot** reach a FIX acceptor
directly; a gateway process that holds the TCP socket is unavoidable.

This is a property of TCP, not of any design choice: FIX support inherently
breaks SocketBench's "zero-install, just open the web page" character. The user
must run a small gateway process (or deploy one) before connecting.

## Decisions (locked)

- **Transport role:** SocketBench is the initiator; target is a TCP FIX acceptor.
- **Gateway:** thin, generic **WS↔TCP relay** run via `npx socketbench-fix-gateway`.
  It is *not* FIX-version-aware. It supports **plain TCP and TLS** outbound.
- **Session ownership:** the **browser** owns the FIX session state machine and
  encoding (consistent with the existing WS/STOMP/RSocket clients). The gateway
  only relays bytes and splits the inbound stream into whole FIX messages.
- **v1 composer:** **raw tag=value** with automatic session management. No data
  dictionary, no message templates (both are future work).
- **FIX version:** **FIX 4.x with a configurable BeginString** (FIX.4.0–FIX.4.4).
  The session header/trailer and Logon are uniform across these. FIXT.1.1 / 5.0
  is out of scope for v1.
- **v1 session depth:** respond to TestRequest, send heartbeats, track sequence
  numbers and **surface gaps**. Automatic ResendRequest / gap-fill is **v2**.

## Architecture & data flow

```
┌─────────────────┐  WebSocket   ┌──────────────────┐  TCP / TLS   ┌────────────┐
│  SocketBench    │  ws://local  │  npx gateway     │  host:port   │  FIX       │
│  (browser)      │ ───────────► │  (WS↔TCP relay)  │ ───────────► │  Acceptor  │
│  FIXClient      │ ◄─────────── │  + frame splitter│ ◄─────────── │  (venue)   │
│  owns session   │  FIX frames  │  no FIX logic    │  byte stream │            │
└─────────────────┘              └──────────────────┘              └────────────┘
```

1. User starts the gateway: `npx socketbench-fix-gateway` (defaults to `localhost:9001`).
2. Browser connects with the target as query params:
   `ws://localhost:9001/?host=fix.venue.com&port=9823&tls=1`.
3. On WS open the gateway dials TCP (or TLS) to the target.
4. Byte pump: browser→WS→TCP→acceptor, and acceptor→TCP→WS→browser.
5. The gateway splits the inbound TCP byte stream into discrete FIX messages on
   the `10=NNN<SOH>` checksum boundary, so the browser receives exactly one FIX
   message per WS frame.

### Gateway control channel

To tell the browser whether the *acceptor* connection succeeded (the WS to the
gateway opens immediately on localhost, before the TCP dial completes), the
gateway uses a minimal in-band control protocol:

- The gateway's **first** WS message is a JSON control frame:
  - `{"type":"open"}` once TCP/TLS to the acceptor is established, or
  - `{"type":"error","message":"…"}` on dial failure, after which it closes the WS.
- Every **subsequent** WS message is a raw FIX frame.
- On acceptor disconnect the gateway sends `{"type":"close","reason":"…"}` (or
  closes the WS with a reason) and tears down.

Disambiguation is trivial: FIX frames start with `8=`; control frames start with
`{`. The browser treats a message starting with `{` as control, otherwise FIX.

## Components

### Gateway — `gateway/` (new Node sub-package)

- Published so `npx socketbench-fix-gateway` works; includes a Dockerfile.
- Dependencies: `ws` (WebSocket server) + Node built-in `net` / `tls`.
- Per WS connection: read `host` / `port` / `tls` query params → dial plain TCP
  or TLS → relay bytes both ways → frame-split inbound on the checksum boundary.
- On TCP/TLS error or close: emit the control frame and close the WS.
- Stateless, not FIX-version-aware; reusable as a generic TCP bridge.
- ~150 lines. Lives in the otherwise-frontend repo as a separate package with its
  own `package.json` (kept out of the Vite build).

### Browser FIX engine — `src/lib/clients/fix.ts` (new)

A `FIXClient` sibling to `WSClient` / `StompClient` / `RSocketClient`, with the
same shape: `connect()`, `send()`, `close()`, `ready()`, plus opts callbacks
(`onStatus`, `onMessage`, `onClose`, `onError`, and an `addMsg`-style hook).

Responsibilities:

- **Encoding.** Assemble `8=BeginString<SOH>9=BodyLength<SOH>…<SOH>10=CheckSum<SOH>`.
  - `BodyLength` (tag 9) = number of bytes after the `9=…<SOH>` field up to and
    including the `<SOH>` preceding tag 10.
  - `CheckSum` (tag 10) = sum of all bytes up to and including the `<SOH>`
    preceding tag 10, mod 256, formatted as 3 zero-padded digits.
  - Standard header tags filled automatically: `8` BeginString, `9` BodyLength,
    `35` MsgType, `34` MsgSeqNum, `49` SenderCompID, `56` TargetCompID,
    `52` SendingTime (UTC `YYYYMMDD-HH:MM:SS.sss`).
- **Session automation.**
  - On connect (after control `{"type":"open"}`) → send **Logon (35=A)** with
    `98=0` (EncryptMethod None), `108=HeartBtInt`, optional `141=Y`
    (ResetSeqNumFlag), optional `553`/`554` (Username/Password).
  - **Heartbeat (35=0)** emitted every HeartBtInt seconds of outbound inactivity.
  - Reply to inbound **TestRequest (35=1)** with a Heartbeat echoing tag `112`.
  - **Logout (35=5)** sent on user disconnect.
  - Outbound `34` increments per sent message. Inbound `34` is tracked; a gap
    (received seq > expected) is **surfaced** to the user. Automatic
    ResendRequest / SequenceReset handling is v2.
- **Parsing.** Split inbound frames on `<SOH>` into `{tag, value}` pairs; read
  tag `35` to classify session messages (`0` Heartbeat, `1` TestRequest,
  `2` ResendRequest, `3` Reject, `4` SequenceReset, `5` Logout, `A` Logon) vs
  application messages.
- **Templating.** Reuse the existing `render()` (`src/lib/templating.ts`) so
  `{{uuid}}` etc. expand in user fields (e.g. ClOrdID) at send time.

### Encode/decode helpers

Pure functions (colocated in `fix.ts` or a small `fix/` folder): `encode(fields)`,
`decode(frame)`, `checksum(bytes)`, `bodyLength(...)`. These carry the unit tests.

## Integration points (existing files to modify)

- `src/types.ts` — add `"fix"` to the protocol union; add FIX endpoint fields
  (gateway URL, target host/port, TLS flag, BeginString, SenderCompID,
  TargetCompID, HeartBtInt, ResetSeqNum flag, Username, Password, raw message body).
- `src/state/endpoint.ts` — defaults for the new fields; include them in
  `ENDPOINT_CONFIG_KEYS` so they persist and export/import.
- `src/lib/clients/index.ts` — export `FIXClient`.
- `src/lib/clientFactory.ts` — construct a `FIXClient` for protocol `"fix"`.
- `src/hooks/useConnections.ts` — add `fixSend` (apply `render()` then
  `FIXClient.send`); trigger Logon on connect; wire Logout/disconnect.
- `src/components/ConnectionBar.tsx` — add **FIX** to the protocol selector and
  the gateway/target connection fields.
- `src/components/Composer.tsx` — add a FIX branch: session config fields + a
  raw tag=value message editor with Send, and a Logon/Logout control.
- `src/components/Results.tsx` — render inbound FIX frames as a `tag=value` line
  list (no field names in v1).

## UI

- **Protocol selector** gains **FIX**.
- **Connection config:** gateway URL, target host, target port, TLS toggle,
  BeginString, SenderCompID, TargetCompID, HeartBtInt, ResetSeqNum toggle,
  optional Username/Password.
- **Composer:** raw tag=value editor for the application message. Because SOH
  (`\x01`) is non-printable, the user types with `|` (or newlines) as the visible
  separator; we convert to `<SOH>` on send. Inbound display renders `<SOH>` as
  `|`. A Logon/Logout control pair manages the session.
- **Results:** inbound frames appear in the existing message stream, each
  expanded into `tag=value` lines.

## Error handling

- **Gateway not running** (WS to gateway fails) → "Start the gateway with
  `npx socketbench-fix-gateway`".
- **TCP/TLS dial failure** → surfaced from the `{"type":"error"}` control frame.
- **Logon reject** (`35=3`) or Logout-with-text → surfaced in the stream.
- **Bad checksum / parse failure** on inbound → show the raw frame.
- **Mixed content:** localhost `ws://` is exempt from HTTPS mixed-content
  blocking, so the hosted site at green-leaves.github.io can still reach a local
  gateway.

## Testing

- **`fix.ts` unit tests** (vitest, pure logic — matches existing test style):
  checksum calculation, body-length calculation, encode round-trip, parse,
  TestRequest→Heartbeat response, outbound sequence-number increment, gap
  detection.
- **Gateway tests** (Node env): relay bytes against a mock `net.Server`, verify
  checksum-boundary framing, and exercise the TLS dial path.

## Out of scope (future work)

- Automatic ResendRequest / SequenceReset (gap-fill) handling.
- FIX data dictionary: field names, enums, message-type dropdowns, validation,
  human-readable inbound rendering.
- Message templates (NewOrderSingle, OrderCancelRequest, MarketDataRequest, …).
- FIXT.1.1 / FIX 5.0 session layer (separate ApplVerID).
- FIXML / FIX-JSON / SBE encodings.
