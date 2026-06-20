import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FIXClient } from "../../src/lib/clients/fix";
import { parseMessage, getField, SOH } from "../../src/lib/clients/fix/codec";

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose && this.onclose({ code: 1000, reason: "" });
  }
  emit(data: string) {
    this.onmessage && this.onmessage({ data });
  }
}

const SESSION: import("../../src/lib/clients/fix").FIXSession = {
  beginString: "FIX.4.4",
  senderCompID: "CLIENT",
  targetCompID: "SERVER",
  heartBtInt: 30,
  resetSeqNum: true,
};

beforeEach(() => {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});
afterEach(() => {
  vi.useRealTimers();
  FakeWebSocket.last = null;
});

describe("FIXClient logon", () => {
  it("sends Logon (35=A) after the gateway control 'open'", () => {
    const client = new FIXClient({ url: "ws://gw", session: SESSION });
    client.connect();
    const ws = FakeWebSocket.last!;
    ws.emit('{"type":"open"}');
    expect(ws.sent).toHaveLength(1);
    const fields = parseMessage(ws.sent[0]);
    expect(getField(fields, 35)).toBe("A");
    expect(getField(fields, 49)).toBe("CLIENT");
    expect(getField(fields, 56)).toBe("SERVER");
    expect(getField(fields, 108)).toBe("30");
    expect(getField(fields, 141)).toBe("Y");
    expect(getField(fields, 34)).toBe("1");
  });

  it("becomes ready and fires onLogon on inbound Logon", () => {
    const onLogon = vi.fn();
    const client = new FIXClient({ url: "ws://gw", session: SESSION, onLogon });
    client.connect();
    const ws = FakeWebSocket.last!;
    ws.emit('{"type":"open"}');
    expect(client.ready()).toBe(false);
    ws.emit("8=FIX.4.4" + SOH + "35=A" + SOH + "34=1" + SOH + "10=000" + SOH);
    expect(client.ready()).toBe(true);
    expect(onLogon).toHaveBeenCalledOnce();
  });
});

describe("FIXClient send", () => {
  it("throws before logon", () => {
    const client = new FIXClient({ url: "ws://gw", session: SESSION });
    client.connect();
    expect(() => client.send("35=D | 55=AAPL")).toThrow(/logged on/i);
  });

  it("builds an app message with incremented seq, stripping controlled tags", () => {
    const client = new FIXClient({ url: "ws://gw", session: SESSION });
    client.connect();
    const ws = FakeWebSocket.last!;
    ws.emit('{"type":"open"}'); // seq 1 = Logon
    ws.emit("8=FIX.4.4" + SOH + "35=A" + SOH + "34=1" + SOH + "10=000" + SOH);
    const frame = client.send("35=D | 34=999 | 55=AAPL | 38=100");
    const fields = parseMessage(frame);
    expect(getField(fields, 35)).toBe("D");
    expect(getField(fields, 34)).toBe("2"); // client-controlled, not the user's 999
    expect(getField(fields, 55)).toBe("AAPL");
    expect(getField(fields, 38)).toBe("100");
  });
});

describe("FIXClient session automation", () => {
  it("replies to TestRequest with a Heartbeat echoing 112", () => {
    const client = new FIXClient({ url: "ws://gw", session: SESSION });
    client.connect();
    const ws = FakeWebSocket.last!;
    ws.emit('{"type":"open"}');
    ws.emit("8=FIX.4.4" + SOH + "35=A" + SOH + "34=1" + SOH + "10=000" + SOH);
    const before = ws.sent.length;
    ws.emit("8=FIX.4.4" + SOH + "35=1" + SOH + "34=2" + SOH + "112=ABC" + SOH + "10=000" + SOH);
    const reply = parseMessage(ws.sent[ws.sent.length - 1]);
    expect(ws.sent.length).toBe(before + 1);
    expect(getField(reply, 35)).toBe("0");
    expect(getField(reply, 112)).toBe("ABC");
  });

  it("surfaces an inbound sequence gap", () => {
    const onGap = vi.fn();
    const client = new FIXClient({ url: "ws://gw", session: SESSION, onGap });
    client.connect();
    const ws = FakeWebSocket.last!;
    ws.emit('{"type":"open"}');
    ws.emit("8=FIX.4.4" + SOH + "35=A" + SOH + "34=1" + SOH + "10=000" + SOH); // expect next = 2
    ws.emit("8=FIX.4.4" + SOH + "35=0" + SOH + "34=5" + SOH + "10=000" + SOH); // got 5
    expect(onGap).toHaveBeenCalledWith(2, 5);
  });

  it("emits a Heartbeat when idle past the interval", () => {
    vi.useFakeTimers();
    const client = new FIXClient({ url: "ws://gw", session: { ...SESSION, heartBtInt: 1 } });
    client.connect();
    const ws = FakeWebSocket.last!;
    ws.emit('{"type":"open"}');
    ws.emit("8=FIX.4.4" + SOH + "35=A" + SOH + "34=1" + SOH + "10=000" + SOH);
    const before = ws.sent.length;
    vi.advanceTimersByTime(1100);
    const last = parseMessage(ws.sent[ws.sent.length - 1]);
    expect(ws.sent.length).toBe(before + 1);
    expect(getField(last, 35)).toBe("0");
  });
});
