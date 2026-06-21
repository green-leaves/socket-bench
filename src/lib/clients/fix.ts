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
