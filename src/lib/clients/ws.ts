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
    const opts = this.opts;
    const protocolList = (opts.protocols || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const ws = protocolList.length ? new WebSocket(opts.url, protocolList) : new WebSocket(opts.url);
    this.ws = ws;
    ws.onopen = () => opts.onOpen && opts.onOpen();
    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof Blob) {
        event.data.text().then((text) => opts.onMessage && opts.onMessage(text, "text"));
      } else if (event.data instanceof ArrayBuffer) {
        opts.onMessage && opts.onMessage(dec.decode(new Uint8Array(event.data)), "binary");
      } else {
        opts.onMessage && opts.onMessage(event.data, "text");
      }
    };
    ws.onclose = (event: CloseEvent) => opts.onClose && opts.onClose(event.code, event.reason);
    ws.onerror = () =>
      opts.onError && opts.onError("WebSocket error (check URL / CORS / mixed-content)");
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
