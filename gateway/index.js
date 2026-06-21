#!/usr/bin/env node
"use strict";
// gateway/index.js — generic WebSocket<->TCP/TLS relay for FIX acceptors.
// Not FIX-aware beyond splitting the inbound stream on the checksum boundary.

const net = require("node:net");
const tls = require("node:tls");
const { WebSocketServer } = require("ws");

const SOH = 0x01;

/** Split a buffer into complete FIX messages on the `<SOH>10=NNN<SOH>` boundary. */
function extractFrames(buffer) {
  const frames = [];
  let start = 0;
  const needle = Buffer.from([SOH, 0x31, 0x30, 0x3d]); // SOH '1' '0' '='
  while (true) {
    const tagIdx = buffer.indexOf(needle, start);
    if (tagIdx === -1) break;
    const end = tagIdx + 8; // SOH + "10=" + 3 digits + trailing SOH
    if (end > buffer.length) break; // checksum field not fully arrived
    frames.push(buffer.slice(start, end));
    start = end;
  }
  return { frames, rest: buffer.slice(start) };
}

/** Read host/port/tls from the WS request URL query string. */
function parseTarget(reqUrl) {
  const url = new URL(reqUrl, "http://localhost");
  const host = url.searchParams.get("host");
  const port = Number(url.searchParams.get("port"));
  if (!host || !Number.isInteger(port) || port <= 0) return null;
  const tlsFlag = url.searchParams.get("tls");
  return { host, port, tls: tlsFlag === "1" || tlsFlag === "true" };
}

function dialerFor(useTls) {
  return useTls ? tls.connect : net.connect;
}

const DEFAULT_PORT = 9001;

const HELP = `socketbench-fix-gateway — thin WebSocket<->TCP/TLS relay for FIX acceptors

Usage:
  npx socketbench-fix-gateway [options]

Options:
  -p, --port <number>   Port to listen on (default: ${DEFAULT_PORT}, or $PORT)
  -h, --help            Show this help and exit

The browser connects with:
  ws://localhost:<port>/?host=<acceptor-host>&port=<acceptor-port>&tls=<0|1>
and the gateway relays raw bytes to the FIX acceptor over TCP (or TLS).`;

/** Parse CLI args into { port, help }. Throws on unknown args or a bad port. */
function parseArgs(argv) {
  let port = Number(process.env.PORT) || DEFAULT_PORT;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "-p" || arg === "--port") {
      port = Number(argv[++i]);
    } else if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    } else if (/^\d+$/.test(arg)) {
      port = Number(arg); // bare positional port (backwards compatible)
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!help && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("invalid port (expected an integer 1-65535)");
  }
  return { port, help };
}

function start(port) {
  const server = new WebSocketServer({ port });

  server.on("connection", (ws, req) => {
    const target = parseTarget(req.url || "");
    if (!target) {
      ws.send(JSON.stringify({ type: "error", message: "missing host/port query params" }));
      ws.close();
      return;
    }

    const dial = dialerFor(target.tls);
    const socket = dial({ host: target.host, port: target.port, servername: target.host });
    const connectEvent = target.tls ? "secureConnect" : "connect";

    let buffer = Buffer.alloc(0);

    socket.on(connectEvent, () => ws.send(JSON.stringify({ type: "open" })));
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest } = extractFrames(buffer);
      buffer = rest;
      for (const frame of frames) if (ws.readyState === ws.OPEN) ws.send(frame.toString());
    });
    socket.on("error", (error) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "error", message: error.message }));
      ws.close();
    });
    socket.on("close", () => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "close", reason: "acceptor closed" }));
      ws.close();
    });

    ws.on("message", (data) => {
      // browser sends FIX frames as text; write raw bytes to the acceptor
      socket.write(typeof data === "string" ? data : Buffer.from(data));
    });
    ws.on("close", () => socket.destroy());
  });

  return server;
}

module.exports = { extractFrames, parseTarget, dialerFor, start, parseArgs, DEFAULT_PORT };

if (require.main === module) {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("Run with --help for usage.");
    process.exit(1);
  }
  if (parsed.help) {
    console.log(HELP);
  } else {
    start(parsed.port);
    console.log(`socketbench-fix-gateway listening on ws://localhost:${parsed.port}`);
  }
}
