/* socket-clients.js — live protocol clients for the Socket testing tool.
   Exposes window.Sockets = { WSClient, StompClient, RSocketClient, util }.
   Classic script (no modules) so it is available globally before the app mounts. */
(function () {
  "use strict";

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function tryParseJSON(s) {
    if (typeof s !== "string") return null;
    var t = s.trim();
    if (!t) return null;
    if (t[0] !== "{" && t[0] !== "[") return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }
  function formatBytes(n) {
    if (n == null) return "—";
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }
  function byteLen(s) { return enc.encode(String(s)).length; }
  function now() { return (typeof performance !== "undefined" ? performance.now() : Date.now()); }

  /* ---------------------------------------------------------------------- */
  /* Raw WebSocket                                                           */
  /* ---------------------------------------------------------------------- */
  function WSClient(opts) {
    this.opts = opts || {};
    this.ws = null;
  }
  WSClient.prototype.connect = function () {
    var o = this.opts, self = this;
    var protos = (o.protocols || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var ws = protos.length ? new WebSocket(o.url, protos) : new WebSocket(o.url);
    this.ws = ws;
    ws.onopen = function () { o.onOpen && o.onOpen(); };
    ws.onmessage = function (ev) {
      if (ev.data instanceof Blob) {
        ev.data.text().then(function (t) { o.onMessage && o.onMessage(t, "text"); });
      } else if (ev.data instanceof ArrayBuffer) {
        o.onMessage && o.onMessage(dec.decode(new Uint8Array(ev.data)), "binary");
      } else {
        o.onMessage && o.onMessage(ev.data, "text");
      }
    };
    ws.onclose = function (ev) { o.onClose && o.onClose(ev.code, ev.reason); };
    ws.onerror = function () { o.onError && o.onError("WebSocket error (check URL / CORS / mixed-content)"); };
  };
  WSClient.prototype.send = function (data) {
    if (!this.ws || this.ws.readyState !== 1) throw new Error("Not connected");
    this.ws.send(data);
    return byteLen(data);
  };
  WSClient.prototype.close = function () { if (this.ws) try { this.ws.close(); } catch (e) {} };
  WSClient.prototype.ready = function () { return this.ws && this.ws.readyState === 1; };

  /* ---------------------------------------------------------------------- */
  /* STOMP 1.2 over WebSocket                                                */
  /* ---------------------------------------------------------------------- */
  var NULL = "\u0000";
  function StompClient(opts) {
    this.opts = opts || {};
    this.ws = null;
    this.subId = 0;
    this.connected = false;
  }
  StompClient.prototype.connect = function () {
    var o = this.opts, self = this;
    var ws = new WebSocket(o.url, ["v12.stomp", "v11.stomp", "v10.stomp"]);
    this.ws = ws;
    ws.onopen = function () {
      var headers = Object.assign({ "accept-version": "1.2", "heart-beat": "0,0" }, o.connectHeaders || {});
      if (o.host) headers.host = o.host;
      self._sendFrame("CONNECT", headers, "");
    };
    ws.onmessage = function (ev) { self._onData(ev.data); };
    ws.onclose = function (ev) { self.connected = false; o.onClose && o.onClose(ev.code, ev.reason); };
    ws.onerror = function () { o.onError && o.onError("WebSocket error (check URL / endpoint)"); };
  };
  StompClient.prototype._onData = function (raw) {
    var self = this;
    if (raw instanceof Blob) { raw.text().then(function (t) { self._onData(t); }); return; }
    if (raw instanceof ArrayBuffer) raw = dec.decode(new Uint8Array(raw));
    // a single ws message may contain multiple frames separated by NULL
    var parts = raw.split(NULL);
    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i];
      if (!chunk || chunk.replace(/[\r\n]/g, "") === "") continue;
      this._handleFrame(chunk);
    }
  };
  StompClient.prototype._handleFrame = function (text) {
    var o = this.opts;
    var sep = text.indexOf("\n\n");
    var head = sep === -1 ? text : text.slice(0, sep);
    var body = sep === -1 ? "" : text.slice(sep + 2);
    var lines = head.split("\n");
    var command = lines.shift().trim();
    var headers = {};
    lines.forEach(function (l) {
      var idx = l.indexOf(":");
      if (idx > -1) headers[l.slice(0, idx)] = l.slice(idx + 1);
    });
    if (command === "CONNECTED") { this.connected = true; o.onConnected && o.onConnected(headers); }
    else if (command === "MESSAGE") { o.onMessage && o.onMessage(body, headers); }
    else if (command === "RECEIPT") { o.onReceipt && o.onReceipt(headers); }
    else if (command === "ERROR") { o.onStompError && o.onStompError(body, headers); }
  };
  StompClient.prototype._sendFrame = function (command, headers, body) {
    var lines = [command];
    headers = headers || {};
    Object.keys(headers).forEach(function (k) { lines.push(k + ":" + headers[k]); });
    var frame = lines.join("\n") + "\n\n" + (body || "") + NULL;
    this.ws.send(frame);
    return byteLen(frame);
  };
  StompClient.prototype.subscribe = function (destination, headers) {
    var id = "sub-" + (++this.subId);
    var h = Object.assign({ id: id, destination: destination, ack: "auto" }, headers || {});
    this._sendFrame("SUBSCRIBE", h, "");
    return id;
  };
  StompClient.prototype.unsubscribe = function (id) { this._sendFrame("UNSUBSCRIBE", { id: id }, ""); };
  StompClient.prototype.send = function (destination, body, headers) {
    var h = Object.assign({ destination: destination, "content-type": "application/json", "content-length": byteLen(body) }, headers || {});
    return this._sendFrame("SEND", h, body || "");
  };
  StompClient.prototype.close = function () {
    if (this.ws && this.ws.readyState === 1) { try { this._sendFrame("DISCONNECT", {}, ""); } catch (e) {} }
    if (this.ws) try { this.ws.close(); } catch (e) {}
  };
  StompClient.prototype.ready = function () { return this.connected; };

  /* ---------------------------------------------------------------------- */
  /* RSocket (core frames) over WebSocket — best-effort, Spring-style         */
  /* ---------------------------------------------------------------------- */
  var FT = { SETUP: 0x01, KEEPALIVE: 0x03, REQUEST_RESPONSE: 0x04, REQUEST_FNF: 0x05,
    REQUEST_STREAM: 0x06, REQUEST_CHANNEL: 0x07, REQUEST_N: 0x08, CANCEL: 0x09,
    PAYLOAD: 0x0A, ERROR: 0x0B, METADATA_PUSH: 0x0C };
  var FLAG = { METADATA: 0x100, FOLLOWS: 0x80, COMPLETE: 0x40, NEXT: 0x20, RESPOND: 0x80 };

  function concat(arrs) {
    var len = 0, i;
    for (i = 0; i < arrs.length; i++) len += arrs[i].length;
    var out = new Uint8Array(len), off = 0;
    for (i = 0; i < arrs.length; i++) { out.set(arrs[i], off); off += arrs[i].length; }
    return out;
  }
  function u32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
  function u24(n) { return new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255]); }
  function u16(n) { return new Uint8Array([(n >> 8) & 255, n & 255]); }
  function header(streamId, type, flags) { return concat([u32(streamId), u16((type << 10) | (flags & 0x3ff))]); }

  // composite metadata with a single routing entry
  function routingMetadata(route) {
    var r = enc.encode(route);
    var tag = concat([new Uint8Array([r.length]), r]);          // routing: [len][route]
    var mimeId = 0x7E;                                          // well-known: message/x.rsocket.routing.v0
    return concat([new Uint8Array([0x80 | mimeId]), u24(tag.length), tag]);
  }

  function RSocketClient(opts) {
    this.opts = opts || {};
    this.ws = null;
    this.streamId = -1;            // client streams are odd: 1,3,5...
    this.handlers = {};            // streamId -> {onPayload,onComplete,onError}
    this.kaTimer = null;
    this.connected = false;
  }
  RSocketClient.prototype._nextStream = function () { this.streamId += 2; return this.streamId; };
  RSocketClient.prototype.connect = function () {
    var o = this.opts, self = this;
    var ws = new WebSocket(o.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = function () {
      self._sendSetup();
      self.connected = true;
      o.onConnected && o.onConnected();
      var ka = (o.keepAlive || 20000);
      self.kaTimer = setInterval(function () {
        if (ws.readyState === 1) self._send(concat([header(0, FT.KEEPALIVE, FLAG.RESPOND), u32(0), u32(0)]));
      }, ka);
    };
    ws.onmessage = function (ev) {
      var buf = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : null;
      if (buf) self._onFrame(buf);
    };
    ws.onclose = function (ev) { self.connected = false; clearInterval(self.kaTimer); o.onClose && o.onClose(ev.code, ev.reason); };
    ws.onerror = function () { o.onError && o.onError("WebSocket error (check URL / RSocket WS transport)"); };
  };
  RSocketClient.prototype._sendSetup = function () {
    var o = this.opts;
    var metaMime = enc.encode("message/x.rsocket.composite-metadata.v0");
    var dataMime = enc.encode(o.dataMime || "application/json");
    var frame = concat([
      header(0, FT.SETUP, 0),
      u16(1), u16(0),                                   // version 1.0
      u32(o.keepAlive || 20000), u32(o.maxLifetime || 90000),
      new Uint8Array([metaMime.length]), metaMime,
      new Uint8Array([dataMime.length]), dataMime
    ]);
    this._send(frame);
  };
  RSocketClient.prototype._send = function (bytes) {
    if (!this.ws || this.ws.readyState !== 1) throw new Error("Not connected");
    this.ws.send(bytes);
    return bytes.length;
  };
  RSocketClient.prototype._buildRequest = function (type, streamId, route, data, initialN) {
    var meta = route ? routingMetadata(route) : null;
    var dataBytes = enc.encode(data == null ? "" : data);
    var flags = 0;
    if (meta) flags |= FLAG.METADATA;
    var parts = [header(streamId, type, flags)];
    if (type === FT.REQUEST_STREAM || type === FT.REQUEST_CHANNEL) parts.push(u32(initialN || 2147483647));
    if (meta) parts.push(concat([u24(meta.length), meta]));
    parts.push(dataBytes);
    return concat(parts);
  };
  RSocketClient.prototype.requestResponse = function (route, data, h) {
    var id = this._nextStream(); this.handlers[id] = h || {};
    var n = this._send(this._buildRequest(FT.REQUEST_RESPONSE, id, route, data));
    return { streamId: id, bytes: n };
  };
  RSocketClient.prototype.requestStream = function (route, data, initialN, h) {
    var id = this._nextStream(); this.handlers[id] = h || {};
    var n = this._send(this._buildRequest(FT.REQUEST_STREAM, id, route, data, initialN));
    return { streamId: id, bytes: n };
  };
  RSocketClient.prototype.requestChannel = function (route, data, initialN, h) {
    var id = this._nextStream(); this.handlers[id] = h || {};
    var n = this._send(this._buildRequest(FT.REQUEST_CHANNEL, id, route, data, initialN));
    return { streamId: id, bytes: n };
  };
  RSocketClient.prototype.fireAndForget = function (route, data) {
    var id = this._nextStream();
    return { streamId: id, bytes: this._send(this._buildRequest(FT.REQUEST_FNF, id, route, data)) };
  };
  RSocketClient.prototype.sendPayload = function (streamId, data, complete) {
    var flags = FLAG.NEXT | (complete ? FLAG.COMPLETE : 0);
    var dataBytes = enc.encode(data == null ? "" : data);
    return this._send(concat([header(streamId, FT.PAYLOAD, flags), dataBytes]));
  };
  RSocketClient.prototype.cancel = function (streamId) {
    try { this._send(header(streamId, FT.CANCEL, 0)); } catch (e) {}
    delete this.handlers[streamId];
  };
  RSocketClient.prototype.requestN = function (streamId, n) { this._send(concat([header(streamId, FT.REQUEST_N, 0), u32(n)])); };
  RSocketClient.prototype._onFrame = function (buf) {
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var streamId = dv.getUint32(0);
    var tf = dv.getUint16(4);
    var type = (tf >> 10) & 0x3f;
    var flags = tf & 0x3ff;
    var pos = 6;
    if (type === FT.KEEPALIVE) {
      if (flags & FLAG.RESPOND) this._send(concat([header(0, FT.KEEPALIVE, 0), u32(0), u32(0)]));
      return;
    }
    if (type === FT.ERROR) {
      var code = dv.getUint32(pos); pos += 4;
      var msg = dec.decode(buf.subarray(pos));
      var h = this.handlers[streamId];
      if (h && h.onError) h.onError(code, msg);
      else this.opts.onError && this.opts.onError("RSocket error " + code + ": " + msg);
      delete this.handlers[streamId];
      return;
    }
    if (type === FT.PAYLOAD) {
      var metaStr = null, dataStr = "";
      if (flags & FLAG.METADATA) {
        var mlen = (buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2]; pos += 3;
        metaStr = dec.decode(buf.subarray(pos, pos + mlen)); pos += mlen;
      }
      dataStr = dec.decode(buf.subarray(pos));
      var hh = this.handlers[streamId];
      if (hh) {
        if ((flags & FLAG.NEXT) || dataStr) hh.onPayload && hh.onPayload(dataStr, metaStr);
        if (flags & FLAG.COMPLETE) { hh.onComplete && hh.onComplete(); delete this.handlers[streamId]; }
      }
    }
  };
  RSocketClient.prototype.close = function () {
    clearInterval(this.kaTimer);
    if (this.ws) try { this.ws.close(); } catch (e) {}
  };
  RSocketClient.prototype.ready = function () { return this.connected; };

  window.Sockets = {
    WSClient: WSClient, StompClient: StompClient, RSocketClient: RSocketClient,
    util: { tryParseJSON: tryParseJSON, formatBytes: formatBytes, byteLen: byteLen, now: now }
  };
})();
