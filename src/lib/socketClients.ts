/* socketClients.ts — live protocol clients for SocketBench.
   Ported verbatim (with TypeScript types) from the design's socket-clients.js.
   Exposes WSClient, StompClient, RSocketClient, and util. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function tryParseJSON(s: unknown): unknown {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (t[0] !== "{" && t[0] !== "[") return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

export function byteLen(s: unknown): number {
  return enc.encode(String(s)).length;
}

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/* ---------------------------------------------------------------------- */
/* Raw WebSocket                                                           */
/* ---------------------------------------------------------------------- */
export interface WSClientOpts {
  url: string;
  protocols?: string;
  onOpen?: () => void;
  onMessage?: (text: string, fmt: "text" | "binary") => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (msg: string) => void;
}

export class WSClient {
  opts: WSClientOpts;
  ws: WebSocket | null = null;

  constructor(opts: WSClientOpts) {
    this.opts = opts;
  }

  connect(): void {
    const o = this.opts;
    const protos = (o.protocols || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ws = protos.length ? new WebSocket(o.url, protos) : new WebSocket(o.url);
    this.ws = ws;
    ws.onopen = () => o.onOpen && o.onOpen();
    ws.onmessage = (ev: MessageEvent) => {
      if (ev.data instanceof Blob) {
        ev.data.text().then((t) => o.onMessage && o.onMessage(t, "text"));
      } else if (ev.data instanceof ArrayBuffer) {
        o.onMessage && o.onMessage(dec.decode(new Uint8Array(ev.data)), "binary");
      } else {
        o.onMessage && o.onMessage(ev.data, "text");
      }
    };
    ws.onclose = (ev: CloseEvent) => o.onClose && o.onClose(ev.code, ev.reason);
    ws.onerror = () =>
      o.onError && o.onError("WebSocket error (check URL / CORS / mixed-content)");
  }

  send(data: string): number {
    if (!this.ws || this.ws.readyState !== 1) throw new Error("Not connected");
    this.ws.send(data);
    return byteLen(data);
  }

  close(): void {
    if (this.ws)
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
  }

  ready(): boolean {
    return !!this.ws && this.ws.readyState === 1;
  }
}

/* ---------------------------------------------------------------------- */
/* STOMP 1.2 over WebSocket                                                */
/* ---------------------------------------------------------------------- */
const NULL = String.fromCharCode(0);

export interface StompClientOpts {
  url: string;
  host?: string;
  connectHeaders?: Record<string, string>;
  onConnected?: (headers: Record<string, string>) => void;
  onMessage?: (body: string, headers: Record<string, string>) => void;
  onReceipt?: (headers: Record<string, string>) => void;
  onStompError?: (body: string, headers: Record<string, string>) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (msg: string) => void;
}

export class StompClient {
  opts: StompClientOpts;
  ws: WebSocket | null = null;
  subId = 0;
  connected = false;

  constructor(opts: StompClientOpts) {
    this.opts = opts;
  }

  connect(): void {
    const o = this.opts;
    const ws = new WebSocket(o.url, ["v12.stomp", "v11.stomp", "v10.stomp"]);
    this.ws = ws;
    ws.onopen = () => {
      const headers: Record<string, string> = Object.assign(
        { "accept-version": "1.2", "heart-beat": "0,0" },
        o.connectHeaders || {},
      );
      if (o.host) headers.host = o.host;
      this._sendFrame("CONNECT", headers, "");
    };
    ws.onmessage = (ev: MessageEvent) => this._onData(ev.data);
    ws.onclose = (ev: CloseEvent) => {
      this.connected = false;
      o.onClose && o.onClose(ev.code, ev.reason);
    };
    ws.onerror = () => o.onError && o.onError("WebSocket error (check URL / endpoint)");
  }

  private _onData(raw: string | Blob | ArrayBuffer): void {
    if (raw instanceof Blob) {
      raw.text().then((t) => this._onData(t));
      return;
    }
    let text: string;
    if (raw instanceof ArrayBuffer) text = dec.decode(new Uint8Array(raw));
    else text = raw;
    // a single ws message may contain multiple frames separated by NULL
    const parts = text.split(NULL);
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
      if (!chunk || chunk.replace(/[\r\n]/g, "") === "") continue;
      this._handleFrame(chunk);
    }
  }

  private _handleFrame(text: string): void {
    const o = this.opts;
    const sep = text.indexOf("\n\n");
    const head = sep === -1 ? text : text.slice(0, sep);
    const body = sep === -1 ? "" : text.slice(sep + 2);
    const lines = head.split("\n");
    const command = (lines.shift() || "").trim();
    const headers: Record<string, string> = {};
    lines.forEach((l) => {
      const idx = l.indexOf(":");
      if (idx > -1) headers[l.slice(0, idx)] = l.slice(idx + 1);
    });
    if (command === "CONNECTED") {
      this.connected = true;
      o.onConnected && o.onConnected(headers);
    } else if (command === "MESSAGE") {
      o.onMessage && o.onMessage(body, headers);
    } else if (command === "RECEIPT") {
      o.onReceipt && o.onReceipt(headers);
    } else if (command === "ERROR") {
      o.onStompError && o.onStompError(body, headers);
    }
  }

  private _sendFrame(
    command: string,
    headers: Record<string, string | number>,
    body: string,
  ): number {
    const lines = [command];
    headers = headers || {};
    Object.keys(headers).forEach((k) => lines.push(k + ":" + headers[k]));
    const frame = lines.join("\n") + "\n\n" + (body || "") + NULL;
    this.ws!.send(frame);
    return byteLen(frame);
  }

  subscribe(destination: string, headers?: Record<string, string>): string {
    const id = "sub-" + ++this.subId;
    const h = Object.assign(
      { id, destination, ack: "auto" },
      headers || {},
    );
    this._sendFrame("SUBSCRIBE", h, "");
    return id;
  }

  unsubscribe(id: string): void {
    this._sendFrame("UNSUBSCRIBE", { id }, "");
  }

  send(destination: string, body: string, headers?: Record<string, string>): number {
    const h = Object.assign(
      {
        destination,
        "content-type": "application/json",
        "content-length": byteLen(body),
      },
      headers || {},
    );
    return this._sendFrame("SEND", h, body || "");
  }

  close(): void {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this._sendFrame("DISCONNECT", {}, "");
      } catch {
        /* ignore */
      }
    }
    if (this.ws)
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
  }

  ready(): boolean {
    return this.connected;
  }
}

/* ---------------------------------------------------------------------- */
/* RSocket (core frames) over WebSocket — best-effort, Spring-style         */
/* ---------------------------------------------------------------------- */
const FT = {
  SETUP: 0x01,
  KEEPALIVE: 0x03,
  REQUEST_RESPONSE: 0x04,
  REQUEST_FNF: 0x05,
  REQUEST_STREAM: 0x06,
  REQUEST_CHANNEL: 0x07,
  REQUEST_N: 0x08,
  CANCEL: 0x09,
  PAYLOAD: 0x0a,
  ERROR: 0x0b,
  METADATA_PUSH: 0x0c,
} as const;
const FLAG = {
  METADATA: 0x100,
  FOLLOWS: 0x80,
  COMPLETE: 0x40,
  NEXT: 0x20,
  RESPOND: 0x80,
} as const;

function concat(arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (let i = 0; i < arrs.length; i++) len += arrs[i].length;
  const out = new Uint8Array(len);
  let off = 0;
  for (let i = 0; i < arrs.length; i++) {
    out.set(arrs[i], off);
    off += arrs[i].length;
  }
  return out;
}
function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}
function u24(n: number): Uint8Array {
  return new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}
function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 255, n & 255]);
}
function header(streamId: number, type: number, flags: number): Uint8Array {
  return concat([u32(streamId), u16((type << 10) | (flags & 0x3ff))]);
}

// composite metadata with a single routing entry
function routingMetadata(route: string): Uint8Array {
  const r = enc.encode(route);
  const tag = concat([new Uint8Array([r.length]), r]); // routing: [len][route]
  const mimeId = 0x7e; // well-known: message/x.rsocket.routing.v0
  return concat([new Uint8Array([0x80 | mimeId]), u24(tag.length), tag]);
}

export interface RSocketStreamHandlers {
  onPayload?: (data: string, meta: string | null) => void;
  onComplete?: () => void;
  onError?: (code: number, msg: string) => void;
}

export interface RSocketClientOpts {
  url: string;
  dataMime?: string;
  keepAlive?: number;
  maxLifetime?: number;
  onConnected?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (msg: string) => void;
}

export class RSocketClient {
  opts: RSocketClientOpts;
  ws: WebSocket | null = null;
  streamId = -1; // client streams are odd: 1,3,5...
  handlers: Record<number, RSocketStreamHandlers> = {};
  kaTimer: ReturnType<typeof setInterval> | null = null;
  connected = false;

  constructor(opts: RSocketClientOpts) {
    this.opts = opts;
  }

  private _nextStream(): number {
    this.streamId += 2;
    return this.streamId;
  }

  connect(): void {
    const o = this.opts;
    const ws = new WebSocket(o.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this._sendSetup();
      this.connected = true;
      o.onConnected && o.onConnected();
      const ka = o.keepAlive || 20000;
      this.kaTimer = setInterval(() => {
        if (ws.readyState === 1)
          this._send(concat([header(0, FT.KEEPALIVE, FLAG.RESPOND), u32(0), u32(0)]));
      }, ka);
    };
    ws.onmessage = (ev: MessageEvent) => {
      const buf = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : null;
      if (buf) this._onFrame(buf);
    };
    ws.onclose = (ev: CloseEvent) => {
      this.connected = false;
      if (this.kaTimer) clearInterval(this.kaTimer);
      o.onClose && o.onClose(ev.code, ev.reason);
    };
    ws.onerror = () =>
      o.onError && o.onError("WebSocket error (check URL / RSocket WS transport)");
  }

  private _sendSetup(): void {
    const o = this.opts;
    const metaMime = enc.encode("message/x.rsocket.composite-metadata.v0");
    const dataMime = enc.encode(o.dataMime || "application/json");
    const frame = concat([
      header(0, FT.SETUP, 0),
      u16(1),
      u16(0), // version 1.0
      u32(o.keepAlive || 20000),
      u32(o.maxLifetime || 90000),
      new Uint8Array([metaMime.length]),
      metaMime,
      new Uint8Array([dataMime.length]),
      dataMime,
    ]);
    this._send(frame);
  }

  private _send(bytes: Uint8Array): number {
    if (!this.ws || this.ws.readyState !== 1) throw new Error("Not connected");
    this.ws.send(bytes);
    return bytes.length;
  }

  private _buildRequest(
    type: number,
    streamId: number,
    route: string,
    data: string,
    initialN?: number,
  ): Uint8Array {
    const meta = route ? routingMetadata(route) : null;
    const dataBytes = enc.encode(data == null ? "" : data);
    let flags = 0;
    if (meta) flags |= FLAG.METADATA;
    const parts: Uint8Array[] = [header(streamId, type, flags)];
    if (type === FT.REQUEST_STREAM || type === FT.REQUEST_CHANNEL)
      parts.push(u32(initialN || 2147483647));
    if (meta) parts.push(concat([u24(meta.length), meta]));
    parts.push(dataBytes);
    return concat(parts);
  }

  requestResponse(
    route: string,
    data: string,
    h?: RSocketStreamHandlers,
  ): { streamId: number; bytes: number } {
    const id = this._nextStream();
    this.handlers[id] = h || {};
    const n = this._send(this._buildRequest(FT.REQUEST_RESPONSE, id, route, data));
    return { streamId: id, bytes: n };
  }

  requestStream(
    route: string,
    data: string,
    initialN: number,
    h?: RSocketStreamHandlers,
  ): { streamId: number; bytes: number } {
    const id = this._nextStream();
    this.handlers[id] = h || {};
    const n = this._send(this._buildRequest(FT.REQUEST_STREAM, id, route, data, initialN));
    return { streamId: id, bytes: n };
  }

  requestChannel(
    route: string,
    data: string,
    initialN: number,
    h?: RSocketStreamHandlers,
  ): { streamId: number; bytes: number } {
    const id = this._nextStream();
    this.handlers[id] = h || {};
    const n = this._send(this._buildRequest(FT.REQUEST_CHANNEL, id, route, data, initialN));
    return { streamId: id, bytes: n };
  }

  fireAndForget(route: string, data: string): { streamId: number; bytes: number } {
    const id = this._nextStream();
    return { streamId: id, bytes: this._send(this._buildRequest(FT.REQUEST_FNF, id, route, data)) };
  }

  sendPayload(streamId: number, data: string, complete: boolean): number {
    const flags = FLAG.NEXT | (complete ? FLAG.COMPLETE : 0);
    const dataBytes = enc.encode(data == null ? "" : data);
    return this._send(concat([header(streamId, FT.PAYLOAD, flags), dataBytes]));
  }

  cancel(streamId: number): void {
    try {
      this._send(header(streamId, FT.CANCEL, 0));
    } catch {
      /* ignore */
    }
    delete this.handlers[streamId];
  }

  requestN(streamId: number, n: number): void {
    this._send(concat([header(streamId, FT.REQUEST_N, 0), u32(n)]));
  }

  private _onFrame(buf: Uint8Array): void {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const streamId = dv.getUint32(0);
    const tf = dv.getUint16(4);
    const type = (tf >> 10) & 0x3f;
    const flags = tf & 0x3ff;
    let pos = 6;
    if (type === FT.KEEPALIVE) {
      if (flags & FLAG.RESPOND)
        this._send(concat([header(0, FT.KEEPALIVE, 0), u32(0), u32(0)]));
      return;
    }
    if (type === FT.ERROR) {
      const code = dv.getUint32(pos);
      pos += 4;
      const msg = dec.decode(buf.subarray(pos));
      const h = this.handlers[streamId];
      if (h && h.onError) h.onError(code, msg);
      else this.opts.onError && this.opts.onError("RSocket error " + code + ": " + msg);
      delete this.handlers[streamId];
      return;
    }
    if (type === FT.PAYLOAD) {
      let metaStr: string | null = null;
      let dataStr = "";
      if (flags & FLAG.METADATA) {
        const mlen = (buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2];
        pos += 3;
        metaStr = dec.decode(buf.subarray(pos, pos + mlen));
        pos += mlen;
      }
      dataStr = dec.decode(buf.subarray(pos));
      const hh = this.handlers[streamId];
      if (hh) {
        if (flags & FLAG.NEXT || dataStr) hh.onPayload && hh.onPayload(dataStr, metaStr);
        if (flags & FLAG.COMPLETE) {
          hh.onComplete && hh.onComplete();
          delete this.handlers[streamId];
        }
      }
    }
  }

  close(): void {
    if (this.kaTimer) clearInterval(this.kaTimer);
    if (this.ws)
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
  }

  ready(): boolean {
    return this.connected;
  }
}

export const util = { tryParseJSON, formatBytes, byteLen, now };

export type AnyClient = WSClient | StompClient | RSocketClient;
