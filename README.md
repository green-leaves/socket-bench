# SocketBench

A "Postman for sockets" — a developer tool for testing **WebSocket**, **STOMP over WebSocket**, and **RSocket** endpoints against live servers. Enter an endpoint, compose a payload or subscription, connect, and watch frames stream back in real time.

**🔗 Live demo: https://green-leaves.github.io/socket-bench/**

Built from the Claude Design prototype (`SocketBench.dc.html`) as a React + Vite + TypeScript app.

## Features

- **Four protocols against live endpoints**
  - **WebSocket** — native browser socket, optional sub-protocols, free-form payload.
  - **STOMP 1.2 over WebSocket** — full text framing: subscribe, send, connect-headers editor.
  - **RSocket** *(experimental)* — core binary frames (setup, request-response, request-stream, request-channel, fire-and-forget, keepalive, cancel) over the Spring-style WebSocket transport.
  - **FIX 4.x** *(initiator)* — log on to a remote acceptor through a thin `npx socketbench-fix-gateway` (WS↔TCP/TLS relay; browsers can't open raw TCP). Raw tag=value composer with automatic session management (Logon, heartbeats, sequence numbers, checksum).
- **3-column layout** — Collections/History sidebar · request composer · results, with a draggable divider between composer and results.
- **Results** — live message timeline (newest first, color-coded in/out/sys/err, JSON syntax-highlighted), a raw chronological log, and a metrics tab (counts, in/out, avg latency, bytes, 30s throughput sparkline). Filter + direction toggles and active-subscription chips with cancel.
- **Saved connections & history** — collection rows show a colored protocol badge + name; everything persists to `localStorage`.
- **Tweaks** — accent color + density (cozy/compact), top-right.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle to dist/
npm run preview  # serve the production build
```

## Project layout

```
src/
  main.tsx                 entry
  App.tsx                  state, connection logic, persistence, theme
  types.ts                 shared types
  styles.ts                shared style helpers (segmented controls, badges, colors)
  lib/socketClients.ts     WS / STOMP / RSocket clients (the engine)
  components/
    Sidebar.tsx            collections + history
    ConnectionBar.tsx      protocol selector, URL, connect, status, tweaks
    Composer.tsx           per-protocol request composer
    Results.tsx            messages / raw / metrics
    JsonView.tsx           JSON syntax highlighter
```

## Notes / caveats

- **RSocket metadata conventions vary by server.** This client sends `SETUP` with composite-metadata and `application/json` data, single routing-metadata entry, no frame-length prefix (Spring WebSocket style). Other servers may need adjustment.
- **WebSocket can't set custom HTTP headers** (browser limitation) — auth must go via sub-protocol or query string. STOMP/RSocket auth goes through their own frames.
- **FIX needs the gateway.** Browsers cannot open raw TCP sockets, so FIX talks to a small local relay: `npx socketbench-fix-gateway` (see `gateway/`). Point the FIX panel's gateway URL at it (default `ws://localhost:9988`). The relay supports plain TCP and TLS and is not FIX-version-aware.

The original design bundle is kept in `_design/` for reference.
