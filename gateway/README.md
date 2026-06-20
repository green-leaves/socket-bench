# socketbench-fix-gateway

Thin WebSocket↔TCP/TLS relay so the browser-based [SocketBench](https://green-leaves.github.io/socket-bench/) can talk to FIX acceptors (browsers cannot open raw TCP sockets).

## Run

```bash
npx socketbench-fix-gateway          # listens on ws://localhost:9001
PORT=9100 npx socketbench-fix-gateway
```

Then in SocketBench, pick the **FIX** protocol and set the gateway URL to `ws://localhost:9001`, plus the acceptor host/port and TLS toggle.

## How it works

The browser connects with the target in the query string:
`ws://localhost:9001/?host=fix.venue.com&port=9823&tls=1`. The gateway dials that
host over TCP (or TLS), pumps bytes both ways, and splits the inbound stream into
whole FIX messages on the `10=NNN` checksum boundary. Its first WS message is a
JSON control frame (`{"type":"open"}` / `"error"` / `"close"`); every later
message is a raw FIX frame. It is not FIX-version-aware.
