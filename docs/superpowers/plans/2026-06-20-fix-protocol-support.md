# FIX Protocol Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add FIX (initiator) protocol support to SocketBench — log on to a remote FIX acceptor through a thin `npx` WS↔TCP gateway, send raw tag=value application messages, and stream responses back.

**Architecture:** The browser owns the FIX session state machine and tag=value encoding (a new `FIXClient`, sibling to the existing WS/STOMP/RSocket clients). A small standalone Node package (`gateway/`, run via `npx socketbench-fix-gateway`) is a generic WS↔TCP/TLS byte relay that splits the inbound TCP stream into whole FIX messages on the checksum boundary. The browser never touches TCP.

**Tech Stack:** TypeScript (strict), React 18, Vite 6, Vitest 4 (node env, pure-logic tests). Gateway: Node + `ws` + built-in `net`/`tls`, tested with `node:test`.

## Global Constraints

- **Commit messages:** human-authored voice only. NEVER mention "Claude", "AI", "generated", or "co-authored by". Focus on what changed and why. (From the user's CLAUDE.md.)
- **Branch-first workflow:** never commit directly on `master`. For each task: `git checkout -b <branch>`, commit, `git checkout master`, `git merge --ff-only <branch>`, `git branch -d <branch>`. Push/deploy only when the user asks.
- **FIX version scope:** FIX 4.x only, BeginString configurable (`FIX.4.0`–`FIX.4.4`). No FIXT.1.1 / 5.0.
- **v1 composer:** raw tag=value + automatic session management. No data dictionary, no message templates.
- **v1 session depth:** Logon / Heartbeat / TestRequest-reply / Logout + sequence tracking with gaps *surfaced*. No automatic ResendRequest / gap-fill.
- **Gateway:** thin & generic — relays bytes, splits frames on the `␁10=NNN␁` boundary, supports plain TCP and TLS. Not FIX-version-aware.
- **Control channel:** gateway's first WS message is JSON (`{"type":"open"|"error"|"close",...}`); all later WS messages are raw FIX frames. Browser disambiguates: a message starting with `{` is control, otherwise FIX.
- **SOH:** the FIX field separator is `\x01`. The composer uses `|` (or newline) as the visible separator, converted to `␁` on send; inbound is displayed with `␁` shown as ` | `.
- **Tests:** match existing style — pure-logic Vitest specs under `tests/`, run with `npm test`. Keep `npm run lint` and `npm run build` clean.

---

### Task 1: FIX codec (pure encode/decode helpers)

**Files:**
- Create: `src/lib/clients/fix/codec.ts`
- Test: `tests/lib/fix-codec.test.ts`

**Interfaces:**
- Consumes: nothing (pure, self-contained).
- Produces:
  - `SOH: string` (the `\x01` separator)
  - `interface FixField { tag: number; value: string }`
  - `checksum(prefix: string): string` — 3-digit zero-padded mod-256 sum of char codes
  - `encodeMessage(beginString: string, body: Array<[number, string | number]>): string` — prepends `8`/`9`, appends `10`; `body` is every field after BodyLength and before CheckSum, in order (starting with tag 35)
  - `parseMessage(frame: string): FixField[]`
  - `getField(fields: FixField[], tag: number): string | undefined`
  - `prettyFrame(frame: string): string` — `␁`→` | ` for display
  - `utcTimestamp(date?: Date): string` — `YYYYMMDD-HH:MM:SS.sss` in UTC
  - `parseUserFields(raw: string): Array<[number, string]>` — split user input on `|`/newline into `[tag, value]`; throws on malformed input

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/fix-codec.test.ts
import { describe, it, expect } from "vitest";
import {
  SOH,
  checksum,
  encodeMessage,
  parseMessage,
  getField,
  prettyFrame,
  utcTimestamp,
  parseUserFields,
} from "../../src/lib/clients/fix/codec";

describe("checksum", () => {
  it("sums char codes mod 256, zero-padded to 3 digits", () => {
    // 'A'(65) + 'B'(66) + SOH(1) = 132
    expect(checksum("AB" + SOH)).toBe("132");
  });
  it("wraps at 256 and pads", () => {
    expect(checksum(String.fromCharCode(255) + String.fromCharCode(2))).toBe("001");
  });
});

describe("encodeMessage", () => {
  it("frames with BeginString, BodyLength and a consistent CheckSum", () => {
    const msg = encodeMessage("FIX.4.2", [
      [35, "0"],
      [49, "A"],
      [56, "B"],
      [34, 1],
      [52, "20240101-00:00:00.000"],
    ]);
    // body = "35=0|49=A|56=B|34=1|52=20240101-00:00:00.000|" (| = SOH) => length 45
    expect(msg.startsWith("8=FIX.4.2" + SOH + "9=45" + SOH)).toBe(true);
    expect(msg.endsWith(SOH)).toBe(true);
    // CheckSum field must equal checksum() of everything before it
    const cut = msg.lastIndexOf("10=");
    expect(msg.slice(cut)).toBe("10=" + checksum(msg.slice(0, cut)) + SOH);
  });
});

describe("parseMessage / getField", () => {
  it("splits SOH-delimited tag=value pairs", () => {
    const fields = parseMessage("8=FIX.4.4" + SOH + "35=A" + SOH + "108=30" + SOH);
    expect(getField(fields, 35)).toBe("A");
    expect(getField(fields, 108)).toBe("30");
    expect(getField(fields, 99)).toBeUndefined();
  });
});

describe("prettyFrame", () => {
  it("renders SOH as ' | '", () => {
    expect(prettyFrame("8=FIX.4.4" + SOH + "35=0" + SOH)).toBe("8=FIX.4.4 | 35=0");
  });
});

describe("utcTimestamp", () => {
  it("formats as YYYYMMDD-HH:MM:SS.sss (UTC)", () => {
    expect(utcTimestamp(new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 6)))).toBe("20240102-03:04:05.006");
  });
});

describe("parseUserFields", () => {
  it("splits on | and newline into [tag, value]", () => {
    expect(parseUserFields("35=D | 55=AAPL\n38=100")).toEqual([
      [35, "D"],
      [55, "AAPL"],
      [38, "100"],
    ]);
  });
  it("throws on a field with no '='", () => {
    expect(() => parseUserFields("35=D | nope")).toThrow(/tag=value/);
  });
  it("throws on a non-numeric tag", () => {
    expect(() => parseUserFields("abc=1")).toThrow(/tag/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fix-codec`
Expected: FAIL — cannot resolve `../../src/lib/clients/fix/codec`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/clients/fix/codec.ts
/* codec.ts — FIX tag=value encoding/decoding primitives (ASCII; SOH-delimited).
   Pure functions, no I/O. The FIXClient session engine builds on these. */

export const SOH = "\x01";

export interface FixField {
  tag: number;
  value: string;
}

/** 3-digit zero-padded mod-256 sum of the bytes up to (and including) the SOH
    before tag 10. FIX is ASCII, so char codes == byte values. */
export function checksum(prefix: string): string {
  let sum = 0;
  for (let i = 0; i < prefix.length; i++) sum += prefix.charCodeAt(i);
  return String(sum % 256).padStart(3, "0");
}

/** Build a complete FIX message. `body` is every field after BodyLength(9) and
    before CheckSum(10), in order, starting with MsgType(35). */
export function encodeMessage(beginString: string, body: Array<[number, string | number]>): string {
  const bodyStr = body.map(([tag, value]) => `${tag}=${value}`).join(SOH) + SOH;
  const head = `8=${beginString}${SOH}9=${bodyStr.length}${SOH}`;
  const prefix = head + bodyStr;
  return prefix + `10=${checksum(prefix)}${SOH}`;
}

export function parseMessage(frame: string): FixField[] {
  return frame
    .split(SOH)
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return { tag: Number(pair.slice(0, eq)), value: pair.slice(eq + 1) };
    });
}

export function getField(fields: FixField[], tag: number): string | undefined {
  const found = fields.find((field) => field.tag === tag);
  return found ? found.value : undefined;
}

/** Human-readable single-line rendering for the message log. */
export function prettyFrame(frame: string): string {
  return frame.split(SOH).filter(Boolean).join(" | ");
}

/** FIX SendingTime format: YYYYMMDD-HH:MM:SS.sss in UTC. */
export function utcTimestamp(date: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.` +
    `${pad(date.getUTCMilliseconds(), 3)}`
  );
}

/** Parse the composer's raw message (fields separated by `|` or newline). */
export function parseUserFields(raw: string): Array<[number, string]> {
  return raw
    .split(/[|\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) throw new Error(`Bad field "${pair}" — expected tag=value`);
      const tag = Number(pair.slice(0, eq));
      if (!Number.isInteger(tag) || tag <= 0) throw new Error(`Bad tag in "${pair}"`);
      return [tag, pair.slice(eq + 1)] as [number, string];
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fix-codec`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/fix-codec
git add src/lib/clients/fix/codec.ts tests/lib/fix-codec.test.ts
git commit -m "feat: add FIX tag=value codec (encode, parse, checksum)"
git checkout master && git merge --ff-only feat/fix-codec && git branch -d feat/fix-codec
```

---

### Task 2: FIXClient session engine

**Files:**
- Create: `src/lib/clients/fix.ts`
- Modify: `src/lib/clients/index.ts` (export `FIXClient` and re-export codec helpers used by the factory)
- Test: `tests/lib/fix-client.test.ts`

**Interfaces:**
- Consumes: codec from Task 1 (`encodeMessage`, `parseMessage`, `getField`, `utcTimestamp`, `parseUserFields`, `FixField`); `byteLen` from `./util`.
- Produces:
  - `interface FIXSession { beginString: string; senderCompID: string; targetCompID: string; heartBtInt: number; resetSeqNum: boolean; username?: string; password?: string }`
  - `interface FIXClientOpts { url: string; session: FIXSession; onLogon?: () => void; onLogout?: (text: string) => void; onMessage?: (frame: string, fields: FixField[]) => void; onSession?: (msgType: string, frame: string, fields: FixField[]) => void; onGap?: (expected: number, received: number) => void; onClose?: (code: number, reason: string) => void; onError?: (msg: string) => void }`
  - `class FIXClient` with `connect(): void`, `send(rawAppMessage: string): string` (returns the encoded frame), `logout(text?: string): void`, `close(): void`, `ready(): boolean`
  - From `index.ts`: `FIXClient`, `type FIXClientOpts`, `type FIXSession`, and re-exported `prettyFrame`, `getField`, `parseMessage`, `type FixField`; `AnyClient` widened to include `FIXClient`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/fix-client.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fix-client`
Expected: FAIL — cannot resolve `../../src/lib/clients/fix`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/clients/fix.ts
import {
  encodeMessage,
  parseMessage,
  getField,
  parseUserFields,
  utcTimestamp,
  type FixField,
} from "./fix/codec";

export interface FIXSession {
  beginString: string;
  senderCompID: string;
  targetCompID: string;
  heartBtInt: number;
  resetSeqNum: boolean;
  username?: string;
  password?: string;
}

export interface FIXClientOpts {
  url: string;
  session: FIXSession;
  onLogon?: () => void;
  onLogout?: (text: string) => void;
  onMessage?: (frame: string, fields: FixField[]) => void;
  onSession?: (msgType: string, frame: string, fields: FixField[]) => void;
  onGap?: (expected: number, received: number) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (msg: string) => void;
}

const ADMIN_TYPES = new Set(["0", "1", "2", "3", "4", "5", "A"]);
// Session-controlled tags the user may not set in an application message.
const CONTROLLED_TAGS = new Set([8, 9, 10, 34, 35, 49, 52, 56]);

export class FIXClient {
  opts: FIXClientOpts;
  ws: WebSocket | null = null;
  loggedOn = false;
  private outSeq = 1;
  private expectedInSeq = 1;
  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private lastSentAt = 0;

  constructor(opts: FIXClientOpts) {
    this.opts = opts;
  }

  connect(): void {
    const opts = this.opts;
    if (opts.session.resetSeqNum) {
      this.outSeq = 1;
      this.expectedInSeq = 1;
    }
    const ws = new WebSocket(opts.url);
    this.ws = ws;
    ws.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : "";
      if (data.charAt(0) === "{") this._onControl(data);
      else if (data) this._onFrame(data);
    };
    ws.onclose = (event: CloseEvent) => {
      this.loggedOn = false;
      this._stopHeartbeat();
      opts.onClose && opts.onClose(event.code, event.reason);
    };
    ws.onerror = () =>
      opts.onError &&
      opts.onError("Gateway not reachable — start it with: npx socketbench-fix-gateway");
  }

  /** Send a user-composed application message. Returns the full encoded frame. */
  send(rawAppMessage: string): string {
    if (!this.ready()) throw new Error("Not logged on.");
    const parsed = parseUserFields(rawAppMessage);
    const msgType = parsed.find(([tag]) => tag === 35);
    if (!msgType) throw new Error("Message needs a 35=MsgType field.");
    const appFields = parsed.filter(([tag]) => !CONTROLLED_TAGS.has(tag));
    return this._sendMessage(String(msgType[1]), appFields);
  }

  logout(text?: string): void {
    if (this.ws && this.ws.readyState === 1 && this.loggedOn) {
      try {
        this._sendMessage("5", text ? [[58, text]] : []);
      } catch {
        /* ignore */
      }
    }
    this.loggedOn = false;
  }

  close(): void {
    this.logout();
    this._stopHeartbeat();
    if (this.ws)
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
  }

  ready(): boolean {
    return this.loggedOn;
  }

  private _sendMessage(msgType: string, fields: Array<[number, string | number]>): string {
    const session = this.opts.session;
    const body: Array<[number, string | number]> = [
      [35, msgType],
      [49, session.senderCompID],
      [56, session.targetCompID],
      [34, this.outSeq],
      [52, utcTimestamp()],
      ...fields,
    ];
    const frame = encodeMessage(session.beginString, body);
    this.ws!.send(frame);
    this.outSeq++;
    this.lastSentAt = Date.now();
    return frame;
  }

  private _logon(): void {
    const session = this.opts.session;
    const fields: Array<[number, string | number]> = [
      [98, 0],
      [108, session.heartBtInt],
    ];
    if (session.resetSeqNum) fields.push([141, "Y"]);
    if (session.username) fields.push([553, session.username]);
    if (session.password) fields.push([554, session.password]);
    this._sendMessage("A", fields);
  }

  private _onControl(data: string): void {
    let message: { type?: string; message?: string; reason?: string };
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message.type === "open") {
      this._logon();
      this._startHeartbeat();
    } else if (message.type === "error") {
      this.opts.onError && this.opts.onError(message.message || "Gateway error");
    }
    // "close" is followed by a WS close; handled in ws.onclose.
  }

  private _onFrame(frame: string): void {
    const fields = parseMessage(frame);
    const msgType = getField(fields, 35) || "";
    const seqStr = getField(fields, 34);
    if (seqStr) {
      const seq = Number(seqStr);
      if (Number.isFinite(seq)) {
        if (seq > this.expectedInSeq) this.opts.onGap && this.opts.onGap(this.expectedInSeq, seq);
        this.expectedInSeq = seq + 1;
      }
    }
    if (msgType === "A") {
      this.loggedOn = true;
      this.opts.onLogon && this.opts.onLogon();
      return;
    }
    if (msgType === "1") {
      const testReqId = getField(fields, 112);
      this._sendMessage("0", testReqId ? [[112, testReqId]] : []);
      this.opts.onSession && this.opts.onSession(msgType, frame, fields);
      return;
    }
    if (msgType === "5") {
      this.loggedOn = false;
      this.opts.onLogout && this.opts.onLogout(getField(fields, 58) || "");
      this.opts.onSession && this.opts.onSession(msgType, frame, fields);
      return;
    }
    if (ADMIN_TYPES.has(msgType)) {
      this.opts.onSession && this.opts.onSession(msgType, frame, fields);
      return;
    }
    this.opts.onMessage && this.opts.onMessage(frame, fields);
  }

  private _startHeartbeat(): void {
    const intervalMs = Math.max(1, this.opts.session.heartBtInt) * 1000;
    this._stopHeartbeat();
    this.lastSentAt = Date.now();
    this.hbTimer = setInterval(() => {
      if (Date.now() - this.lastSentAt >= intervalMs) {
        try {
          this._sendMessage("0", []);
        } catch {
          /* ignore */
        }
      }
    }, intervalMs);
  }

  private _stopHeartbeat(): void {
    if (this.hbTimer != null) {
      clearInterval(this.hbTimer);
      this.hbTimer = null;
    }
  }
}
```

- [ ] **Step 4: Update the clients barrel**

```ts
// src/lib/clients/index.ts
export { WSClient, type WSClientOpts } from "./ws";
export { StompClient, type StompClientOpts } from "./stomp";
export {
  RSocketClient,
  type RSocketClientOpts,
  type RSocketStreamHandlers,
} from "./rsocket/client";
export { FIXClient, type FIXClientOpts, type FIXSession } from "./fix";
export { prettyFrame, getField, parseMessage, type FixField } from "./fix/codec";
export { util, tryParseJSON, formatBytes, byteLen, now } from "./util";
import type { WSClient } from "./ws";
import type { StompClient } from "./stomp";
import type { RSocketClient } from "./rsocket/client";
import type { FIXClient } from "./fix";

export type AnyClient = WSClient | StompClient | RSocketClient | FIXClient;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- fix-client`
Expected: PASS (all cases). Then `npm test` — full suite still green.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/fix-client
git add src/lib/clients/fix.ts src/lib/clients/index.ts tests/lib/fix-client.test.ts
git commit -m "feat: add browser FIX session client (logon, heartbeat, seq tracking)"
git checkout master && git merge --ff-only feat/fix-client && git branch -d feat/fix-client
```

---

### Task 3: Thin WS↔TCP/TLS gateway (npx package)

**Files:**
- Create: `gateway/package.json`
- Create: `gateway/index.js`
- Create: `gateway/README.md`
- Test: `gateway/test/gateway.test.js`

**Interfaces:**
- Consumes: nothing from the app (standalone Node package).
- Produces (exported from `gateway/index.js` for tests): `extractFrames(buffer: Buffer): { frames: Buffer[]; rest: Buffer }`, `parseTarget(reqUrl: string): { host: string; port: number; tls: boolean } | null`, `dialerFor(tls: boolean): typeof net.connect | typeof tls.connect`, `start(port: number): WebSocketServer`. Wire protocol matches the Global Constraints control channel.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "socketbench-fix-gateway",
  "version": "0.1.0",
  "description": "Thin WebSocket<->TCP/TLS relay for using SocketBench against FIX acceptors",
  "bin": { "socketbench-fix-gateway": "index.js" },
  "main": "index.js",
  "scripts": { "test": "node --test", "start": "node index.js" },
  "license": "MIT",
  "dependencies": { "ws": "^8.18.0" }
}
```

- [ ] **Step 2: Write the failing test**

```js
// gateway/test/gateway.test.js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd gateway && npm install && npm test`
Expected: FAIL — `../index.js` not found / exports undefined.

- [ ] **Step 4: Write the gateway**

```js
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

module.exports = { extractFrames, parseTarget, dialerFor, start };

if (require.main === module) {
  const port = Number(process.env.PORT || process.argv[2] || 9001);
  start(port);
  console.log(`socketbench-fix-gateway listening on ws://localhost:${port}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gateway && npm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the gateway README**

```md
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
```

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/fix-gateway
git add gateway/
git commit -m "feat: add thin WebSocket-to-TCP/TLS FIX gateway (npx package)"
git checkout master && git merge --ff-only feat/fix-gateway && git branch -d feat/fix-gateway
```

---

### Task 4: Endpoint state & protocol type

**Files:**
- Modify: `src/types.ts:1` (Protocol union)
- Modify: `src/state/endpoint.ts` (Endpoint fields, `ENDPOINT_CONFIG_KEYS`, `DEFAULT_ENDPOINT`)
- Test: `tests/state/fix-endpoint.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Protocol` includes `"fix"`; `Endpoint` gains persisted fields `fixGatewayUrl, fixHost, fixPort, fixTls, fixBeginString, fixSenderCompID, fixTargetCompID, fixHeartBtInt, fixResetSeq, fixUsername, fixPassword, fixMessage` (all in `ENDPOINT_CONFIG_KEYS` and `DEFAULT_ENDPOINT`). `fixTls`/`fixResetSeq` are `boolean`; the rest are `string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/state/fix-endpoint.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENDPOINT,
  ENDPOINT_CONFIG_KEYS,
  rehydrate,
  toEndpointConfig,
} from "../../src/state/endpoint";

describe("FIX endpoint fields", () => {
  it("DEFAULT_ENDPOINT seeds FIX defaults", () => {
    const endpoint = DEFAULT_ENDPOINT("e1");
    expect(endpoint.fixBeginString).toBe("FIX.4.4");
    expect(endpoint.fixGatewayUrl).toBe("ws://localhost:9001");
    expect(endpoint.fixHeartBtInt).toBe("30");
    expect(endpoint.fixResetSeq).toBe(true);
    expect(endpoint.fixTls).toBe(false);
    expect(typeof endpoint.fixMessage).toBe("string");
  });

  it("persists and rehydrates FIX config fields", () => {
    for (const key of [
      "fixGatewayUrl",
      "fixHost",
      "fixPort",
      "fixTls",
      "fixBeginString",
      "fixSenderCompID",
      "fixTargetCompID",
      "fixHeartBtInt",
      "fixResetSeq",
      "fixUsername",
      "fixPassword",
      "fixMessage",
    ] as const) {
      expect(ENDPOINT_CONFIG_KEYS).toContain(key);
    }
    const source = {
      ...toEndpointConfig(DEFAULT_ENDPOINT("e2")),
      protocol: "fix",
      fixHost: "fix.example.com",
      fixPort: "9823",
      fixTls: true,
      fixSenderCompID: "ME",
    };
    const restored = rehydrate(source);
    expect(restored.protocol).toBe("fix");
    expect(restored.fixHost).toBe("fix.example.com");
    expect(restored.fixPort).toBe("9823");
    expect(restored.fixTls).toBe(true);
    expect(restored.fixSenderCompID).toBe("ME");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fix-endpoint`
Expected: FAIL — `fixBeginString` etc. do not exist on `Endpoint`; TypeScript/test errors.

- [ ] **Step 3: Update the Protocol union**

In `src/types.ts`, line 1:

```ts
export type Protocol = "ws" | "stomp" | "rsocket" | "fix";
```

- [ ] **Step 4: Add the Endpoint fields**

In `src/state/endpoint.ts`, add these to the `Endpoint` interface, in the persisted-config block right after `rsInitialN: string;`:

```ts
  fixGatewayUrl: string;
  fixHost: string;
  fixPort: string;
  fixTls: boolean;
  fixBeginString: string;
  fixSenderCompID: string;
  fixTargetCompID: string;
  fixHeartBtInt: string;
  fixResetSeq: boolean;
  fixUsername: string;
  fixPassword: string;
  fixMessage: string;
```

Add the same keys to `ENDPOINT_CONFIG_KEYS` (after `"rsInitialN",`):

```ts
  "fixGatewayUrl",
  "fixHost",
  "fixPort",
  "fixTls",
  "fixBeginString",
  "fixSenderCompID",
  "fixTargetCompID",
  "fixHeartBtInt",
  "fixResetSeq",
  "fixUsername",
  "fixPassword",
  "fixMessage",
```

Add the defaults in `DEFAULT_ENDPOINT`'s returned object (after `rsInitialN: "2147483647",`):

```ts
    fixGatewayUrl: "ws://localhost:9001",
    fixHost: "",
    fixPort: "",
    fixTls: false,
    fixBeginString: "FIX.4.4",
    fixSenderCompID: "CLIENT",
    fixTargetCompID: "SERVER",
    fixHeartBtInt: "30",
    fixResetSeq: true,
    fixUsername: "",
    fixPassword: "",
    fixMessage: "35=D|11={{uuid}}|55=AAPL|54=1|38=100|40=2|44=150.00",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- fix-endpoint`
Expected: PASS. Then `npm run build` — typecheck clean.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/fix-state
git add src/types.ts src/state/endpoint.ts tests/state/fix-endpoint.test.ts
git commit -m "feat: add FIX endpoint config fields and protocol type"
git checkout master && git merge --ff-only feat/fix-state && git branch -d feat/fix-state
```

---

### Task 5: Wire FIXClient into the factory and connection manager

**Files:**
- Modify: `src/lib/clientFactory.ts`
- Modify: `src/hooks/useConnections.ts`
- Test: `tests/lib/fix-factory.test.ts`

**Interfaces:**
- Consumes: `FIXClient`, `prettyFrame`, `getField`, `byteLen` from `./clients` (Task 2); `render` from `../lib/templating`; the new endpoint fields (Task 4).
- Produces: `createClient` returns a `FIXClient` when `protocol === "fix"`; `ClientConfig` widened with the FIX fields; `useConnections` returns `fixSend(id: string): void` and validates FIX connections.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/fix-factory.test.ts
import { describe, it, expect } from "vitest";
import { createClient } from "../../src/lib/clientFactory";
import { FIXClient } from "../../src/lib/clients";
import { DEFAULT_ENDPOINT } from "../../src/state/endpoint";

describe("createClient FIX branch", () => {
  it("builds a FIXClient for protocol 'fix' with a gateway URL from the fields", () => {
    const endpoint = {
      ...DEFAULT_ENDPOINT("e1"),
      protocol: "fix" as const,
      fixGatewayUrl: "ws://localhost:9001",
      fixHost: "fix.example.com",
      fixPort: "9823",
      fixTls: true,
    };
    const client = createClient(endpoint, {
      onStatus: () => {},
      addMsg: () => {},
      err: () => {},
    });
    expect(client).toBeInstanceOf(FIXClient);
    expect((client as FIXClient).opts.url).toBe(
      "ws://localhost:9001/?host=fix.example.com&port=9823&tls=1",
    );
    expect((client as FIXClient).opts.session.senderCompID).toBe("CLIENT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fix-factory`
Expected: FAIL — factory returns an RSocketClient (default branch); not a FIXClient.

- [ ] **Step 3: Extend the factory**

In `src/lib/clientFactory.ts`, update the imports at the top:

```ts
import {
  WSClient,
  StompClient,
  RSocketClient,
  FIXClient,
  prettyFrame,
  getField,
  byteLen,
  type AnyClient,
} from "./clients";
```

Widen `ClientConfig` (add after `stompConnectHeaders: HeaderRow[];`):

```ts
  fixGatewayUrl: string;
  fixHost: string;
  fixPort: string;
  fixTls: boolean;
  fixBeginString: string;
  fixSenderCompID: string;
  fixTargetCompID: string;
  fixHeartBtInt: string;
  fixResetSeq: boolean;
  fixUsername: string;
  fixPassword: string;
```

Add this helper above `createClient`:

```ts
const FIX_SESSION_LABELS: Record<string, string> = {
  "0": "Heartbeat",
  "1": "TestRequest",
  "2": "ResendRequest",
  "3": "Reject",
  "4": "SequenceReset",
  "5": "Logout",
  A: "Logon",
};

function buildGatewayUrl(config: ClientConfig): string {
  const base = config.fixGatewayUrl.replace(/\/+$/, "");
  return (
    `${base}/?host=${encodeURIComponent(config.fixHost)}` +
    `&port=${encodeURIComponent(config.fixPort)}&tls=${config.fixTls ? "1" : "0"}`
  );
}
```

Add the FIX branch inside `createClient`, before the final `return new RSocketClient(...)`:

```ts
  if (appState.protocol === "fix") {
    return new FIXClient({
      url: buildGatewayUrl(appState),
      session: {
        beginString: appState.fixBeginString,
        senderCompID: appState.fixSenderCompID,
        targetCompID: appState.fixTargetCompID,
        heartBtInt: Number(appState.fixHeartBtInt) || 30,
        resetSeqNum: appState.fixResetSeq,
        username: appState.fixUsername || undefined,
        password: appState.fixPassword || undefined,
      },
      onLogon: () => {
        handlers.onStatus("open", "FIX logged on");
        handlers.addMsg({ dir: "sys", raw: "Logon ack received" });
      },
      onLogout: (text) =>
        handlers.addMsg({ dir: "sys", raw: "Logout" + (text ? ": " + text : "") }),
      onMessage: (frame, fields) =>
        handlers.addMsg({
          dir: "in",
          raw: prettyFrame(frame),
          label: getField(fields, 35) || "",
          size: byteLen(frame),
        }),
      onSession: (msgType, frame) =>
        handlers.addMsg({
          dir: "sys",
          raw: prettyFrame(frame),
          label: FIX_SESSION_LABELS[msgType] || "MsgType " + msgType,
        }),
      onGap: (expected, received) =>
        handlers.addMsg({
          dir: "sys",
          kind: "err",
          raw: `Sequence gap: expected ${expected}, received ${received}`,
        }),
      onClose: () => {
        handlers.onStatus("closed", "Closed");
        handlers.addMsg({ dir: "sys", raw: "Disconnected" });
      },
      onError: (message) => {
        handlers.onStatus("error", "Error");
        handlers.err(message);
      },
    });
  }
```

- [ ] **Step 4: Run the factory test**

Run: `npm test -- fix-factory`
Expected: PASS.

- [ ] **Step 5: Add fixSend and FIX connect validation in useConnections**

In `src/hooks/useConnections.ts`, extend the clients import to include `FIXClient`, `prettyFrame`, `byteLen`:

```ts
import {
  type AnyClient,
  WSClient,
  StompClient,
  RSocketClient,
  FIXClient,
  prettyFrame,
  byteLen,
  util,
} from "../lib/clients";
```

In `connect`, replace the URL guard:

```ts
      if (!endpoint.url.trim()) {
        err(id, "Enter an endpoint URL first.");
        return;
      }
```

with a protocol-aware guard:

```ts
      if (endpoint.protocol === "fix") {
        if (!endpoint.fixGatewayUrl.trim() || !endpoint.fixHost.trim() || !endpoint.fixPort.trim()) {
          err(id, "Set the gateway URL, acceptor host and port first.");
          return;
        }
      } else if (!endpoint.url.trim()) {
        err(id, "Enter an endpoint URL first.");
        return;
      }
```

Add `fixSend` next to `wsSend` (after the `wsSend` `useCallback` block):

```ts
  const fixSend = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Not logged on.");
        return;
      }
      try {
        const raw = render(endpoint.fixMessage);
        const frame = (clientsRef.current.get(id) as FIXClient).send(raw);
        addMsg(id, { dir: "out", raw: prettyFrame(frame), label: "sent", size: byteLen(frame) });
      } catch (error) {
        err(id, (error as Error).message);
      }
    },
    [addMsg, endpointOf, err, ready],
  );
```

Add `fixSend` to the returned object (after `wsSend,`):

```ts
    fixSend,
```

- [ ] **Step 6: Verify build and full suite**

Run: `npm run build`
Expected: typecheck clean.

Run: `npm test`
Expected: PASS (all suites including the new ones).

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/fix-wiring
git add src/lib/clientFactory.ts src/hooks/useConnections.ts tests/lib/fix-factory.test.ts
git commit -m "feat: wire FIX client into factory and connection manager"
git checkout master && git merge --ff-only feat/fix-wiring && git branch -d feat/fix-wiring
```

---

### Task 6: ConnectionBar — FIX protocol option

**Files:**
- Modify: `src/components/ConnectionBar.tsx`

**Interfaces:**
- Consumes: `Protocol` now includes `"fix"` (Task 4).
- Produces: the protocol selector offers **FIX**; for FIX the free-text URL input is replaced by a hint (the FIX connection fields live in the Composer). No prop changes.

This task has no unit test (the project has no component-test harness; UI is verified by typecheck, lint, and manual check). It is its own task because a reviewer could accept it independently of the Composer changes.

- [ ] **Step 1: Add FIX to the protocol list**

In `src/components/ConnectionBar.tsx`, extend `PROTOS`:

```ts
const PROTOS: { value: Protocol; label: string }[] = [
  { value: "ws", label: "WebSocket" },
  { value: "stomp", label: "STOMP" },
  { value: "rsocket", label: "RSocket" },
  { value: "fix", label: "FIX" },
];
```

- [ ] **Step 2: Swap the URL input for a hint when protocol is FIX**

Replace the `<input ... />` URL field (the block starting `<input value={props.url}`) with this conditional:

```tsx
      {props.protocol === "fix" ? (
        <div
          style={{
            flex: 1,
            minWidth: "120px",
            padding: "9px 12px",
            borderRadius: "8px",
            border: "1px dashed #2a3340",
            background: "#0c0f15",
            color: "#59616f",
            font: "12px " + MONO,
          }}
        >
          Configure gateway &amp; session below ↓
        </div>
      ) : (
        <input
          value={props.url}
          onChange={props.onUrl}
          placeholder="wss://example.com/ws"
          spellCheck={false}
          className="sb-input"
          style={{
            flex: 1,
            minWidth: "120px",
            background: "#0c0f15",
            border: "1px solid #1c232f",
            borderRadius: "8px",
            padding: "9px 12px",
            color: "#dce1ea",
            font: "13px " + MONO,
            outline: "none",
          }}
        />
      )}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/fix-connectionbar
git add src/components/ConnectionBar.tsx
git commit -m "feat: add FIX option to the protocol selector"
git checkout master && git merge --ff-only feat/fix-connectionbar && git branch -d feat/fix-connectionbar
```

---

### Task 7: Composer — FIX session config and message editor

**Files:**
- Modify: `src/App.tsx` (add `setFieldBool`, pass `fixSend` + `setFieldBool` to Composer)
- Modify: `src/components/Composer.tsx` (FIX branch + props)

**Interfaces:**
- Consumes: `conn.fixSend` (Task 5); the FIX endpoint fields (Task 4); existing `setField`/`setFieldValue`.
- Produces: a FIX composer branch. Connect/Disconnect (in ConnectionBar) performs Logon/Logout; this panel holds the gateway+session config and the raw tag=value message editor with a Send button.

Note (deliberate simplification, consistent with the spec's intent): the **Connect button is the Logon control and Disconnect is the Logout control** — no separate Logon/Logout buttons, since re-logon without reconnecting is meaningless. The session capability is fully delivered.

- [ ] **Step 1: Add the boolean setter in App and pass new props**

In `src/App.tsx`, add after the `setFieldValue` definition:

```ts
  const setFieldBool = (field: keyof Endpoint) => (value: boolean) => {
    if (active) patchEndpoint(active.id, { [field]: value } as Partial<Endpoint>);
  };
```

In the `<Composer ... />` element, add two props (after `removeHeader={removeHeader}`):

```tsx
            setFieldBool={setFieldBool}
            fixSend={() => conn.fixSend(active.id)}
```

- [ ] **Step 2: Extend Composer props**

In `src/components/Composer.tsx`, add to the `Props` interface (after `removeHeader: ...;`):

```ts
  setFieldBool: (field: keyof Endpoint) => (value: boolean) => void;
  fixSend: () => void;
```

- [ ] **Step 3: Add a small FIX field style and the FIX branch**

In `src/components/Composer.tsx`, add this style constant near `payloadLabelStyle`:

```ts
const fixRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 };
```

Add this branch after the closing of the `endpoint.protocol === "stomp"` block (before the `endpoint.protocol === "rsocket"` block):

```tsx
        {endpoint.protocol === "fix" && (
          <>
            <div
              style={{
                background: "#0b0e13",
                border: "1px solid #1c232f",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <div
                style={{
                  font: "700 11px 'IBM Plex Sans'",
                  color: "#8a93a4",
                  letterSpacing: ".06em",
                  marginBottom: "10px",
                }}
              >
                GATEWAY &amp; SESSION
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "10px",
                }}
              >
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Gateway URL</label>
                  <input
                    value={endpoint.fixGatewayUrl}
                    onChange={props.setField("fixGatewayUrl")}
                    placeholder="ws://localhost:9001"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>BeginString</label>
                  <input
                    value={endpoint.fixBeginString}
                    onChange={props.setField("fixBeginString")}
                    placeholder="FIX.4.4"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Acceptor host</label>
                  <input
                    value={endpoint.fixHost}
                    onChange={props.setField("fixHost")}
                    placeholder="fix.venue.com"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Acceptor port</label>
                  <input
                    value={endpoint.fixPort}
                    onChange={props.setField("fixPort")}
                    placeholder="9823"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>SenderCompID</label>
                  <input
                    value={endpoint.fixSenderCompID}
                    onChange={props.setField("fixSenderCompID")}
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>TargetCompID</label>
                  <input
                    value={endpoint.fixTargetCompID}
                    onChange={props.setField("fixTargetCompID")}
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>HeartBtInt (s)</label>
                  <input
                    value={endpoint.fixHeartBtInt}
                    onChange={props.setField("fixHeartBtInt")}
                    placeholder="30"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Username / Password</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      value={endpoint.fixUsername}
                      onChange={props.setField("fixUsername")}
                      placeholder="user (553)"
                      spellCheck={false}
                      className="sb-input"
                      style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                    />
                    <input
                      value={endpoint.fixPassword}
                      onChange={props.setField("fixPassword")}
                      placeholder="pass (554)"
                      spellCheck={false}
                      className="sb-input"
                      style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "18px", marginTop: "12px" }}>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", color: "#c4ccd8", font: "12px 'IBM Plex Sans'" }}
                >
                  <input
                    type="checkbox"
                    checked={endpoint.fixTls}
                    onChange={(event) => props.setFieldBool("fixTls")(event.target.checked)}
                  />
                  TLS to acceptor
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", color: "#c4ccd8", font: "12px 'IBM Plex Sans'" }}
                >
                  <input
                    type="checkbox"
                    checked={endpoint.fixResetSeq}
                    onChange={(event) => props.setFieldBool("fixResetSeq")(event.target.checked)}
                  />
                  Reset seq on logon (141=Y)
                </label>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <label style={payloadLabelStyle}>Application message</label>
                <button onClick={props.fixSend} className="sb-brighten" style={accentBtn}>
                  Send ↵
                </button>
              </div>
              <textarea
                value={endpoint.fixMessage}
                onChange={props.setField("fixMessage")}
                spellCheck={false}
                className="sb-input"
                style={{
                  flex: 1,
                  minHeight: "120px",
                  resize: "none",
                  background: "#0c0f15",
                  border: "1px solid #1c232f",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#dce1ea",
                  font: "13px " + MONO,
                  outline: "none",
                }}
              />
              <div
                style={{ marginTop: "8px", font: "11.5px 'IBM Plex Sans'", color: "#5a6270", lineHeight: 1.5 }}
              >
                Separate fields with <span style={{ fontFamily: MONO }}>|</span> or new lines (e.g.
                <span style={{ fontFamily: MONO }}> 35=D|55=AAPL|38=100</span>). Header tags
                (8/9/34/35/49/52/56) and checksum are managed for you; <span style={{ fontFamily: MONO }}>{"{{uuid}}"}</span>{" "}
                and other variables expand on send. Connect performs Logon; Disconnect performs Logout.
              </div>
            </div>
          </>
        )}
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 5: Manual smoke test**

```bash
# terminal 1
cd gateway && npm install && npm start
# terminal 2
npm run dev
```

In the browser: New endpoint → protocol **FIX** → set gateway `ws://localhost:9001`, host/port of a FIX acceptor (e.g. a local QuickFIX sample), SenderCompID/TargetCompID → **Connect**. Expect a "Logon ack received" sys row, then send the default message and see it echoed in the stream.
Expected: Logon succeeds; outbound/inbound frames appear in the results log.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/fix-composer
git add src/App.tsx src/components/Composer.tsx
git commit -m "feat: add FIX session config and message composer"
git checkout master && git merge --ff-only feat/fix-composer && git branch -d feat/fix-composer
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: README documents the FIX protocol and the gateway requirement.

- [ ] **Step 1: Add FIX to the Features list**

In `README.md`, under "Three protocols against live endpoints" (rename to "Four protocols…"), add a bullet after the RSocket one:

```md
  - **FIX 4.x** *(initiator)* — log on to a remote acceptor through a thin `npx socketbench-fix-gateway` (WS↔TCP/TLS relay; browsers can't open raw TCP). Raw tag=value composer with automatic session management (Logon, heartbeats, sequence numbers, checksum).
```

- [ ] **Step 2: Add a FIX gateway note**

Add to the "Notes / caveats" section:

```md
- **FIX needs the gateway.** Browsers cannot open raw TCP sockets, so FIX talks to a small local relay: `npx socketbench-fix-gateway` (see `gateway/`). Point the FIX panel's gateway URL at it (default `ws://localhost:9001`). The relay supports plain TCP and TLS and is not FIX-version-aware.
```

- [ ] **Step 3: Verify and commit**

Run: `npm run build`
Expected: clean (docs-only, sanity check).

```bash
git checkout -b docs/fix-readme
git add README.md
git commit -m "docs: document FIX protocol and gateway"
git checkout master && git merge --ff-only docs/fix-readme && git branch -d docs/fix-readme
```

---

## Notes for the implementer

- **Run from the repo root** for `npm test` / `npm run build` / `npm run lint`. The gateway has its own `package.json`; run its tests with `cd gateway && npm install && npm test`.
- **Do not** push or move the `v0.2.0` tag or deploy as part of this plan — the user drives releases. After all tasks merge, ask whether to push `master` (auto-deploys Pages) and whether to publish `socketbench-fix-gateway` to npm so `npx` works for others.
- **The gateway is not built by Vite.** Keep it out of `tsconfig`/Vite includes (it lives in `gateway/` with its own manifest); `npm run build` only compiles `src/`.
