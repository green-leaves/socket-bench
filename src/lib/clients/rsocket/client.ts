import { enc, dec } from "../util";
import { FRAME_TYPE, FLAG, concat, u32, u24, u16, header, routingMetadata } from "./frames";

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
  keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  connected = false;

  constructor(opts: RSocketClientOpts) {
    this.opts = opts;
  }

  private _nextStream(): number {
    this.streamId += 2;
    return this.streamId;
  }

  connect(): void {
    const opts = this.opts;
    const ws = new WebSocket(opts.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this._sendSetup();
      this.connected = true;
      opts.onConnected && opts.onConnected();
      const keepAliveMs = opts.keepAlive || 20000;
      this.keepAliveTimer = setInterval(() => {
        if (ws.readyState === 1)
          this._send(concat([header(0, FRAME_TYPE.KEEPALIVE, FLAG.RESPOND), u32(0), u32(0)]));
      }, keepAliveMs);
    };
    ws.onmessage = (event: MessageEvent) => {
      const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
      if (bytes) this._onFrame(bytes);
    };
    ws.onclose = (event: CloseEvent) => {
      this.connected = false;
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      opts.onClose && opts.onClose(event.code, event.reason);
    };
    ws.onerror = () =>
      opts.onError && opts.onError("WebSocket error (check URL / RSocket WS transport)");
  }

  private _sendSetup(): void {
    const opts = this.opts;
    const metaMime = enc.encode("message/x.rsocket.composite-metadata.v0");
    const dataMime = enc.encode(opts.dataMime || "application/json");
    const frame = concat([
      header(0, FRAME_TYPE.SETUP, 0),
      u16(1),
      u16(0), // version 1.0
      u32(opts.keepAlive || 20000),
      u32(opts.maxLifetime || 90000),
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
    if (type === FRAME_TYPE.REQUEST_STREAM || type === FRAME_TYPE.REQUEST_CHANNEL)
      parts.push(u32(initialN || 2147483647));
    if (meta) parts.push(concat([u24(meta.length), meta]));
    parts.push(dataBytes);
    return concat(parts);
  }

  requestResponse(
    route: string,
    data: string,
    handlers?: RSocketStreamHandlers,
  ): { streamId: number; bytes: number } {
    const id = this._nextStream();
    this.handlers[id] = handlers || {};
    const byteCount = this._send(this._buildRequest(FRAME_TYPE.REQUEST_RESPONSE, id, route, data));
    return { streamId: id, bytes: byteCount };
  }

  requestStream(
    route: string,
    data: string,
    initialN: number,
    handlers?: RSocketStreamHandlers,
  ): { streamId: number; bytes: number } {
    const id = this._nextStream();
    this.handlers[id] = handlers || {};
    const byteCount = this._send(this._buildRequest(FRAME_TYPE.REQUEST_STREAM, id, route, data, initialN));
    return { streamId: id, bytes: byteCount };
  }

  requestChannel(
    route: string,
    data: string,
    initialN: number,
    handlers?: RSocketStreamHandlers,
  ): { streamId: number; bytes: number } {
    const id = this._nextStream();
    this.handlers[id] = handlers || {};
    const byteCount = this._send(this._buildRequest(FRAME_TYPE.REQUEST_CHANNEL, id, route, data, initialN));
    return { streamId: id, bytes: byteCount };
  }

  fireAndForget(route: string, data: string): { streamId: number; bytes: number } {
    const id = this._nextStream();
    return { streamId: id, bytes: this._send(this._buildRequest(FRAME_TYPE.REQUEST_FNF, id, route, data)) };
  }

  sendPayload(streamId: number, data: string, complete: boolean): number {
    const flags = FLAG.NEXT | (complete ? FLAG.COMPLETE : 0);
    const dataBytes = enc.encode(data == null ? "" : data);
    return this._send(concat([header(streamId, FRAME_TYPE.PAYLOAD, flags), dataBytes]));
  }

  cancel(streamId: number): void {
    try {
      this._send(header(streamId, FRAME_TYPE.CANCEL, 0));
    } catch {
      /* ignore */
    }
    delete this.handlers[streamId];
  }

  requestN(streamId: number, count: number): void {
    this._send(concat([header(streamId, FRAME_TYPE.REQUEST_N, 0), u32(count)]));
  }

  private _onFrame(bytes: Uint8Array): void {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const streamId = view.getUint32(0);
    const typeAndFlags = view.getUint16(4);
    const type = (typeAndFlags >> 10) & 0x3f;
    const flags = typeAndFlags & 0x3ff;
    let offset = 6;
    if (type === FRAME_TYPE.KEEPALIVE) {
      if (flags & FLAG.RESPOND)
        this._send(concat([header(0, FRAME_TYPE.KEEPALIVE, 0), u32(0), u32(0)]));
      return;
    }
    if (type === FRAME_TYPE.ERROR) {
      const code = view.getUint32(offset);
      offset += 4;
      const message = dec.decode(bytes.subarray(offset));
      const streamHandlers = this.handlers[streamId];
      if (streamHandlers && streamHandlers.onError) streamHandlers.onError(code, message);
      else this.opts.onError && this.opts.onError("RSocket error " + code + ": " + message);
      delete this.handlers[streamId];
      return;
    }
    if (type === FRAME_TYPE.PAYLOAD) {
      let metadata: string | null = null;
      let data = "";
      if (flags & FLAG.METADATA) {
        const metaLen = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
        offset += 3;
        metadata = dec.decode(bytes.subarray(offset, offset + metaLen));
        offset += metaLen;
      }
      data = dec.decode(bytes.subarray(offset));
      const streamHandlers = this.handlers[streamId];
      if (streamHandlers) {
        if (flags & FLAG.NEXT || data) streamHandlers.onPayload && streamHandlers.onPayload(data, metadata);
        if (flags & FLAG.COMPLETE) {
          streamHandlers.onComplete && streamHandlers.onComplete();
          delete this.handlers[streamId];
        }
      }
    }
  }

  close(): void {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
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
