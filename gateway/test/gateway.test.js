const test = require("node:test");
const assert = require("node:assert");
const net = require("node:net");
const { once } = require("node:events");
const WebSocket = require("ws");
const { extractFrames, parseTarget, dialerFor, start } = require("../index.js");

const SOH = "\x01";
const frameA = "8=FIX.4.4" + SOH + "35=A" + SOH + "10=123" + SOH;
const frameB = "8=FIX.4.4" + SOH + "35=0" + SOH + "10=456" + SOH;

test("extractFrames splits on the 10=NNN checksum boundary", () => {
  const { frames, rest } = extractFrames(Buffer.from(frameA + frameB + "8=FIX.4.4" + SOH));
  assert.equal(frames.length, 2);
  assert.equal(frames[0].toString(), frameA);
  assert.equal(frames[1].toString(), frameB);
  assert.equal(rest.toString(), "8=FIX.4.4" + SOH); // partial frame held back
});

test("parseTarget reads host/port/tls from the query", () => {
  assert.deepEqual(parseTarget("/?host=fix.example.com&port=9823&tls=1"), {
    host: "fix.example.com",
    port: 9823,
    tls: true,
  });
  assert.equal(parseTarget("/?host=only"), null); // missing port
});

test("dialerFor selects net vs tls", () => {
  assert.equal(dialerFor(false), net.connect);
  assert.notEqual(dialerFor(true), net.connect); // tls.connect
});

test("relays bytes both ways and frames inbound data", async () => {
  // mock acceptor: on connect, send two concatenated FIX frames
  const acceptor = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      acceptor.received = (acceptor.received || "") + chunk.toString();
    });
    socket.write(frameA + frameB);
  });
  acceptor.listen(0);
  await once(acceptor, "listening");
  const acceptorPort = acceptor.address().port;

  const server = start(0);
  await once(server, "listening");
  const gwPort = server.address().port;

  const ws = new WebSocket(`ws://localhost:${gwPort}/?host=127.0.0.1&port=${acceptorPort}&tls=0`);
  const messages = [];
  ws.on("message", (data) => messages.push(data.toString()));
  await once(ws, "open");

  // first message must be the control 'open'
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(JSON.parse(messages[0]), { type: "open" });
  assert.equal(messages[1], frameA);
  assert.equal(messages[2], frameB);

  // browser -> acceptor
  ws.send("8=FIX.4.4" + SOH + "35=D" + SOH + "10=000" + SOH);
  await new Promise((r) => setTimeout(r, 100));
  assert.match(acceptor.received, /35=D/);

  ws.close();
  server.close();
  acceptor.close();
});
