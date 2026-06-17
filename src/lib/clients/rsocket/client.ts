import { enc, dec } from "../util";
import { FT, FLAG, concat, u32, u24, u16, header, routingMetadata } from "./frames";

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
