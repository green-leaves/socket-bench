import { byteLen, dec } from "./util";

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
