import { byteLen, dec } from "./util";

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
