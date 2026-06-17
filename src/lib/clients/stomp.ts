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
  subscriptionId = 0;
  connected = false;

  constructor(opts: StompClientOpts) {
    this.opts = opts;
  }

  connect(): void {
    const opts = this.opts;
    const ws = new WebSocket(opts.url, ["v12.stomp", "v11.stomp", "v10.stomp"]);
    this.ws = ws;
    ws.onopen = () => {
      const headers: Record<string, string> = Object.assign(
        { "accept-version": "1.2", "heart-beat": "0,0" },
        opts.connectHeaders || {},
      );
      if (opts.host) headers.host = opts.host;
      this._sendFrame("CONNECT", headers, "");
    };
    ws.onmessage = (event: MessageEvent) => this._onData(event.data);
    ws.onclose = (event: CloseEvent) => {
      this.connected = false;
      opts.onClose && opts.onClose(event.code, event.reason);
    };
    ws.onerror = () => opts.onError && opts.onError("WebSocket error (check URL / endpoint)");
  }

  private _onData(raw: string | Blob | ArrayBuffer): void {
    if (raw instanceof Blob) {
      raw.text().then((text) => this._onData(text));
      return;
    }
    let text: string;
    if (raw instanceof ArrayBuffer) text = dec.decode(new Uint8Array(raw));
    else text = raw;
    // a single ws message may contain multiple frames separated by NULL
    const frames = text.split(NULL);
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      if (!frame || frame.replace(/[\r\n]/g, "") === "") continue;
      this._handleFrame(frame);
    }
  }

  private _handleFrame(text: string): void {
    const opts = this.opts;
    const separator = text.indexOf("\n\n");
    const head = separator === -1 ? text : text.slice(0, separator);
    const body = separator === -1 ? "" : text.slice(separator + 2);
    const lines = head.split("\n");
    const command = (lines.shift() || "").trim();
    const headers: Record<string, string> = {};
    lines.forEach((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > -1) headers[line.slice(0, colonIndex)] = line.slice(colonIndex + 1);
    });
    if (command === "CONNECTED") {
      this.connected = true;
      opts.onConnected && opts.onConnected(headers);
    } else if (command === "MESSAGE") {
      opts.onMessage && opts.onMessage(body, headers);
    } else if (command === "RECEIPT") {
      opts.onReceipt && opts.onReceipt(headers);
    } else if (command === "ERROR") {
      opts.onStompError && opts.onStompError(body, headers);
    }
  }

  private _sendFrame(
    command: string,
    headers: Record<string, string | number>,
    body: string,
  ): number {
    const lines = [command];
    headers = headers || {};
    Object.keys(headers).forEach((headerName) => lines.push(headerName + ":" + headers[headerName]));
    const frame = lines.join("\n") + "\n\n" + (body || "") + NULL;
    this.ws!.send(frame);
    return byteLen(frame);
  }

  subscribe(destination: string, headers?: Record<string, string>): string {
    const id = "sub-" + ++this.subscriptionId;
    const subscribeHeaders = Object.assign(
      { id, destination, ack: "auto" },
      headers || {},
    );
    this._sendFrame("SUBSCRIBE", subscribeHeaders, "");
    return id;
  }

  unsubscribe(id: string): void {
    this._sendFrame("UNSUBSCRIBE", { id }, "");
  }

  send(destination: string, body: string, headers?: Record<string, string>): number {
    const sendHeaders = Object.assign(
      {
        destination,
        "content-type": "application/json",
        "content-length": byteLen(body),
      },
      headers || {},
    );
    return this._sendFrame("SEND", sendHeaders, body || "");
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
