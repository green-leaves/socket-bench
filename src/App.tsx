import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  WSClient,
  StompClient,
  RSocketClient,
  util,
  type AnyClient,
} from "./lib/clients";
import type {
  Collection,
  HeaderRow,
  HistoryItem,
  Message,
  Protocol,
  RsModel,
  Settings,
  Status,
  Subscription,
} from "./types";
import { FAM } from "./styles";
import { Sidebar } from "./components/Sidebar";
import { ConnectionBar } from "./components/ConnectionBar";
import { Composer } from "./components/Composer";
import { Results } from "./components/Results";

export interface AppState {
  protocol: Protocol;
  url: string;
  status: Status;
  statusText: string;
  latency: number | null;
  messages: Message[];
  subscriptions: Subscription[];
  collections: Collection[];
  history: HistoryItem[];
  resultTab: "messages" | "raw" | "metrics";
  sidebarTab: "collections" | "history";
  filterText: string;
  filterDir: "all" | "in" | "out" | "sys";
  splitW: number;
  wsPayload: string;
  wsProtocols: string;
  stompSubDest: string;
  stompSendDest: string;
  stompBody: string;
  stompConnectHeaders: HeaderRow[];
  stompSendHeaders: HeaderRow[];
  rsModel: RsModel;
  rsRoute: string;
  rsData: string;
  rsInitialN: string;
  settings: Settings;
}

const DEFAULT_STATE: AppState = {
  protocol: "ws",
  url: "",
  status: "idle",
  statusText: "Not connected",
  latency: null,
  messages: [],
  subscriptions: [],
  collections: [],
  history: [],
  resultTab: "messages",
  sidebarTab: "collections",
  filterText: "",
  filterDir: "all",
  splitW: 480,
  wsPayload: '{\n  "hello": "world"\n}',
  wsProtocols: "",
  stompSubDest: "/topic/messages",
  stompSendDest: "/app/hello",
  stompBody: '{\n  "name": "QA"\n}',
  stompConnectHeaders: [{ k: "", v: "" }],
  stompSendHeaders: [{ k: "", v: "" }],
  rsModel: "rr",
  rsRoute: "greeting",
  rsData: '{\n  "name": "QA"\n}',
  rsInitialN: "2147483647",
  settings: { accent: "#d4662b", density: "comfortable" },
};

const FORM_KEYS: (keyof AppState)[] = [
  "protocol",
  "url",
  "wsPayload",
  "wsProtocols",
  "stompSubDest",
  "stompSendDest",
  "stompBody",
  "rsModel",
  "rsRoute",
  "rsData",
  "rsInitialN",
];

function loadInitialState(): AppState {
  const s: AppState = { ...DEFAULT_STATE };
  try {
    const c = JSON.parse(localStorage.getItem("sktool.collections") || "null");
    const h = JSON.parse(localStorage.getItem("sktool.history") || "null");
    const f = JSON.parse(localStorage.getItem("sktool.form") || "null");
    const set = JSON.parse(localStorage.getItem("sktool.settings") || "null");
    if (Array.isArray(c)) s.collections = c;
    if (Array.isArray(h)) s.history = h;
    if (f && typeof f === "object") Object.assign(s, f);
    if (set && typeof set === "object") s.settings = { ...s.settings, ...set };
  } catch {
    /* ignore */
  }
  return s;
}

const leaf = (str: string) => {
  const parts = String(str || "")
    .split("/")
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};

export function App() {
  const [s, setS] = useState<AppState>(loadInitialState);
  const patch = useCallback(
    (p: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) =>
      setS((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) })),
    [],
  );

  // mutable, render-independent instance values (the DCLogic instance fields)
  const midRef = useRef(0);
  const clientRef = useRef<AnyClient | null>(null);
  const sendTimesRef = useRef<Record<number, number>>({});
  const activeChannelRef = useRef<number | null>(null);
  const splitElRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  // live snapshot of state for socket-event closures + saveForm
  const sRef = useRef(s);
  sRef.current = s;

  /* ---------------- persistence ---------------- */
  useEffect(() => {
    try {
      localStorage.setItem("sktool.collections", JSON.stringify(s.collections));
    } catch {
      /* ignore */
    }
  }, [s.collections]);
  useEffect(() => {
    try {
      localStorage.setItem("sktool.history", JSON.stringify(s.history));
    } catch {
      /* ignore */
    }
  }, [s.history]);
  useEffect(() => {
    try {
      localStorage.setItem("sktool.settings", JSON.stringify(s.settings));
    } catch {
      /* ignore */
    }
  }, [s.settings]);

  const saveForm = useCallback(() => {
    try {
      const cur = sRef.current;
      const form: Record<string, unknown> = {};
      FORM_KEYS.forEach((k) => (form[k] = cur[k]));
      localStorage.setItem("sktool.form", JSON.stringify(form));
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------------- drag + lifecycle ---------------- */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !splitElRef.current) return;
      const r = splitElRef.current.getBoundingClientRect();
      const w = e.clientX - r.left;
      patch({ splitW: Math.max(320, Math.min(r.width - 360, w)) });
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("beforeunload", saveForm);
    return () => {
      saveForm();
      const c = clientRef.current;
      if (c)
        try {
          c.close();
        } catch {
          /* ignore */
        }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("beforeunload", saveForm);
    };
  }, [patch, saveForm]);

  const onDragStart = (e: React.MouseEvent) => {
    draggingRef.current = true;
    e.preventDefault();
  };

  /* ---------------- messages ---------------- */
  const addMsg = useCallback(
    (m: {
      dir?: Message["dir"];
      kind?: Message["kind"];
      raw?: unknown;
      label?: string;
      size?: number;
      latency?: number | null;
    }) => {
      const raw = m.raw == null ? "" : String(m.raw);
      const parsed = util.tryParseJSON(raw);
      const msg: Message = {
        id: ++midRef.current,
        dir: m.dir || "sys",
        kind: m.kind || (m.dir === "in" || m.dir === "out" ? "msg" : "sys"),
        ts: Date.now(),
        label: m.label || "",
        size: m.size != null ? m.size : util.byteLen(raw),
        raw,
        pretty: parsed ? JSON.stringify(parsed, null, 2) : raw,
        isJson: !!parsed,
        latency: m.latency,
      };
      setS((prev) => ({ ...prev, messages: [msg, ...prev.messages].slice(0, 1000) }));
    },
    [],
  );

  const err = useCallback(
    (txt: string) => addMsg({ dir: "sys", kind: "err", raw: txt }),
    [addMsg],
  );
  const clearMessages = () => patch({ messages: [] });
  const fillSample = () =>
    patch({ protocol: "ws", url: "wss://ws.postman-echo.com/raw" });

  const ready = () => !!clientRef.current && clientRef.current.ready();

  const removeSub = useCallback(
    (key: string | number) =>
      setS((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.filter((x) => x.key !== key),
      })),
    [],
  );

  /* ---------------- header editors ---------------- */
  const setHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", i: number, key: "k" | "v") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setS((prev) => {
        const rows = prev[field].slice();
        rows[i] = { ...rows[i], [key]: val };
        return { ...prev, [field]: rows };
      });
    };
  const addHeader = (field: "stompConnectHeaders" | "stompSendHeaders") => () =>
    setS((prev) => ({ ...prev, [field]: prev[field].concat([{ k: "", v: "" }]) }));
  const removeHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", i: number) => () =>
      setS((prev) => {
        const rows = prev[field].filter((_, j) => j !== i);
        return { ...prev, [field]: rows.length ? rows : [{ k: "", v: "" }] };
      });
  const rowsToObj = (rows: HeaderRow[]): Record<string, string> => {
    const o: Record<string, string> = {};
    (rows || []).forEach((r) => {
      if (r.k && r.k.trim()) o[r.k.trim()] = r.v;
    });
    return o;
  };

  /* ---------------- connect / disconnect ---------------- */
  const disconnect = useCallback(
    (silent?: boolean) => {
      if (clientRef.current) {
        try {
          clientRef.current.close();
        } catch {
          /* ignore */
        }
        clientRef.current = null;
      }
      activeChannelRef.current = null;
      if (silent !== true) {
        patch({ status: "closed", statusText: "Disconnected", subscriptions: [] });
        addMsg({ dir: "sys", raw: "Disconnected by user" });
      }
    },
    [addMsg, patch],
  );

  const pushHistory = useCallback(
    (action: string) => {
      const cur = sRef.current;
      const item: HistoryItem = {
        id: "h" + Date.now() + Math.random().toString(36).slice(2, 5),
        protocol: cur.protocol,
        url: cur.url,
        action,
        ts: Date.now(),
      };
      setS((prev) => ({ ...prev, history: [item, ...prev.history].slice(0, 40) }));
    },
    [],
  );

  const connect = useCallback(() => {
    const S = sRef.current;
    if (!S.url.trim()) {
      err("Enter an endpoint URL first.");
      return;
    }
    disconnect(true);
    patch({ status: "connecting", statusText: "Connecting…", latency: null, subscriptions: [] });
    pushHistory("connect");
    saveForm();
    const p = S.protocol;
    if (p === "ws") {
      const client = new WSClient({
        url: S.url,
        protocols: S.wsProtocols,
        onOpen: () => {
          patch({ status: "open", statusText: "Connected" });
          addMsg({ dir: "sys", raw: "WebSocket open · " + S.url });
        },
        onMessage: (t, fmt) => addMsg({ dir: "in", raw: t, label: fmt }),
        onClose: (c, r) => {
          patch({ status: "closed", statusText: "Closed" + (c ? " (" + c + ")" : "") });
          addMsg({ dir: "sys", raw: "Closed" + (r ? ": " + r : "") + " · code " + c });
        },
        onError: (msg) => {
          patch({ status: "error", statusText: "Error" });
          err(msg);
        },
      });
      clientRef.current = client;
    } else if (p === "stomp") {
      const client = new StompClient({
        url: S.url,
        connectHeaders: rowsToObj(S.stompConnectHeaders),
        onConnected: (h) => {
          patch({ status: "open", statusText: "STOMP connected" });
          addMsg({ dir: "sys", raw: "STOMP CONNECTED" + (h.version ? " v" + h.version : "") });
        },
        onMessage: (b, h) =>
          addMsg({ dir: "in", raw: b, label: h.destination || h.subscription || "" }),
        onReceipt: (h) => addMsg({ dir: "sys", raw: "RECEIPT " + (h["receipt-id"] || "") }),
        onStompError: (b, h) => {
          patch({ status: "error", statusText: "STOMP error" });
          err((h.message || "ERROR") + (b ? "\n" + b : ""));
        },
        onClose: (c) => {
          patch({ status: "closed", statusText: "Closed" });
          addMsg({ dir: "sys", raw: "Closed · code " + c });
        },
        onError: (msg) => {
          patch({ status: "error", statusText: "Error" });
          err(msg);
        },
      });
      clientRef.current = client;
    } else {
      const client = new RSocketClient({
        url: S.url,
        onConnected: () => {
          patch({ status: "open", statusText: "RSocket ready" });
          addMsg({
            dir: "sys",
            raw: "RSocket connected · SETUP sent (composite-metadata / application/json)",
          });
        },
        onClose: (c) => {
          patch({ status: "closed", statusText: "Closed" });
          addMsg({ dir: "sys", raw: "Closed · code " + c });
        },
        onError: (msg) => {
          patch({ status: "error", statusText: "Error" });
          err(msg);
        },
      });
      clientRef.current = client;
    }
    try {
      clientRef.current!.connect();
    } catch (e) {
      patch({ status: "error", statusText: "Error" });
      err((e as Error).message);
    }
  }, [addMsg, disconnect, err, patch, pushHistory, saveForm]);

  /* ---------------- sending ---------------- */
  const wsSend = () => {
    if (!ready()) {
      err("Not connected.");
      return;
    }
    try {
      const n = (clientRef.current as WSClient).send(sRef.current.wsPayload);
      addMsg({ dir: "out", raw: sRef.current.wsPayload, size: n });
      pushHistory("send");
    } catch (e) {
      err((e as Error).message);
    }
  };

  const stompSubscribe = () => {
    if (!ready()) {
      err("Connect first (STOMP needs a CONNECTED frame).");
      return;
    }
    const dest = sRef.current.stompSubDest.trim();
    if (!dest) return;
    const id = (clientRef.current as StompClient).subscribe(dest);
    setS((prev) => ({
      ...prev,
      subscriptions: prev.subscriptions.concat([{ key: id, kind: "stomp", label: dest }]),
    }));
    addMsg({ dir: "out", raw: "SUBSCRIBE " + dest, label: dest });
  };

  const stompSend = () => {
    if (!ready()) {
      err("Connect first.");
      return;
    }
    const cur = sRef.current;
    const dest = cur.stompSendDest.trim();
    const n = (clientRef.current as StompClient).send(
      dest,
      cur.stompBody,
      rowsToObj(cur.stompSendHeaders),
    );
    addMsg({ dir: "out", raw: cur.stompBody, label: dest, size: n });
    pushHistory("send");
  };

  const rsRequest = () => {
    if (!ready()) {
      err("Connect first (sends SETUP).");
      return;
    }
    const S = sRef.current;
    const client = clientRef.current as RSocketClient;
    const route = S.rsRoute.trim();
    const data = S.rsData;
    const initN = parseInt(S.rsInitialN, 10) || 2147483647;
    if (S.rsModel === "rr") {
      const r = client.requestResponse(route, data, {
        onPayload: (d) => {
          const t0 = sendTimesRef.current[r.streamId];
          const lat = t0 != null ? Math.round(util.now() - t0) : null;
          addMsg({ dir: "in", raw: d, label: route, latency: lat });
          if (lat != null) patch({ latency: lat });
        },
        onError: (c, m) => err("RSocket error " + c + ": " + m),
      });
      sendTimesRef.current[r.streamId] = util.now();
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-response", size: r.bytes });
    } else if (S.rsModel === "stream") {
      const r2 = client.requestStream(route, data, initN, {
        onPayload: (d) => addMsg({ dir: "in", raw: d, label: route }),
        onComplete: () => {
          removeSub(r2.streamId);
          addMsg({ dir: "sys", raw: "Stream complete · " + route });
        },
        onError: (c, m) => {
          removeSub(r2.streamId);
          err("RSocket error " + c + ": " + m);
        },
      });
      setS((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.concat([
          { key: r2.streamId, kind: "rsocket", label: route + " · stream" },
        ]),
      }));
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-stream", size: r2.bytes });
    } else if (S.rsModel === "channel") {
      const r3 = client.requestChannel(route, data, initN, {
        onPayload: (d) => addMsg({ dir: "in", raw: d, label: route }),
        onComplete: () => {
          removeSub(r3.streamId);
          activeChannelRef.current = null;
          addMsg({ dir: "sys", raw: "Channel complete · " + route });
        },
        onError: (c, m) => {
          removeSub(r3.streamId);
          err("RSocket error " + c + ": " + m);
        },
      });
      activeChannelRef.current = r3.streamId;
      setS((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.concat([
          { key: r3.streamId, kind: "rsocket", label: route + " · channel" },
        ]),
      }));
      addMsg({
        dir: "out",
        raw: data,
        label: route + "  ·  request-channel (open)",
        size: r3.bytes,
      });
    } else {
      const r4 = client.fireAndForget(route, data);
      addMsg({ dir: "out", raw: data, label: route + "  ·  fire-and-forget", size: r4.bytes });
    }
    pushHistory("send");
  };

  const rsChannelPush = () => {
    if (activeChannelRef.current == null) {
      err("No open channel — send a request-channel first.");
      return;
    }
    const n = (clientRef.current as RSocketClient).sendPayload(
      activeChannelRef.current,
      sRef.current.rsData,
      false,
    );
    addMsg({ dir: "out", raw: sRef.current.rsData, label: "channel push", size: n });
  };

  const rsChannelComplete = () => {
    if (activeChannelRef.current == null) return;
    (clientRef.current as RSocketClient).sendPayload(activeChannelRef.current, "", true);
    addMsg({ dir: "sys", raw: "Channel completed by client" });
  };

  const cancelSub = (sub: Subscription) => () => {
    const client = clientRef.current;
    if (client) {
      if (sub.kind === "stomp") {
        try {
          (client as StompClient).unsubscribe(sub.key as string);
        } catch {
          /* ignore */
        }
      } else {
        try {
          (client as RSocketClient).cancel(sub.key as number);
        } catch {
          /* ignore */
        }
      }
    }
    if (sub.kind === "rsocket" && sub.key === activeChannelRef.current)
      activeChannelRef.current = null;
    removeSub(sub.key);
    addMsg({ dir: "sys", raw: "Cancelled · " + sub.label });
  };

  /* ---------------- collections / history ---------------- */
  const defaultName = () => {
    const S = sRef.current;
    if (S.protocol === "stomp")
      return leaf(S.stompSubDest) || leaf(S.stompSendDest) || "subscription";
    if (S.protocol === "rsocket") return (S.rsRoute || "").trim() || "route";
    const l = leaf((S.url || "").replace(/^wss?:\/\//, "").split("?")[0]);
    return l || "connection";
  };
  const saveCollection = () => {
    const S = sRef.current;
    if (!S.url.trim()) {
      err("Enter a URL to save.");
      return;
    }
    const suggested = defaultName();
    const name = typeof window !== "undefined" && window.prompt
      ? window.prompt("Name this connection", suggested)
      : suggested;
    if (name === null) return; // cancelled
    const finalName = (name || "").trim() || suggested;
    const item: Collection = {
      id: "c" + Date.now(),
      name: finalName,
      protocol: S.protocol,
      url: S.url,
      meta: { stompDest: S.stompSubDest, rsRoute: S.rsRoute, rsModel: S.rsModel },
    };
    setS((prev) => ({ ...prev, collections: prev.collections.concat([item]) }));
  };
  const loadCollection = (c: Collection) => () => {
    const p: Partial<AppState> = { protocol: c.protocol, url: c.url };
    if (c.meta) {
      if (c.protocol === "stomp" && c.meta.stompDest) p.stompSubDest = c.meta.stompDest;
      if (c.protocol === "rsocket") {
        if (c.meta.rsRoute) p.rsRoute = c.meta.rsRoute;
        if (c.meta.rsModel) p.rsModel = c.meta.rsModel;
      }
    }
    patch(p);
  };
  const deleteCollection = (c: Collection) => (e: React.MouseEvent) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setS((prev) => ({
      ...prev,
      collections: prev.collections.filter((x) => x.id !== c.id),
    }));
  };
  const loadHistory = (h: HistoryItem) => () =>
    patch({ protocol: h.protocol, url: h.url });
  const clearHistory = () => patch({ history: [] });

  /* ---------------- form field setter ---------------- */
  const setField =
    (k: keyof AppState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patch({ [k]: e.target.value } as Partial<AppState>);

  /* ---------------- theme + derived ---------------- */
  const compact = s.settings.density === "compact";
  const rootStyle: CSSProperties = {
    height: "100vh",
    width: "100%",
    display: "grid",
    gridTemplateColumns: "266px 1fr",
    background: "#0a0c10",
    color: "#dce1ea",
    fontFamily: FAM,
    fontSize: "var(--fs,12.5px)",
    overflow: "hidden",
    ["--accent" as never]: s.settings.accent,
    ["--pad-y" as never]: compact ? "6px" : "9px",
    ["--fs" as never]: compact ? "12px" : "12.5px",
    ["--gap" as never]: "12px",
  };

  const connected = s.status === "open";
  const busy = s.status === "connecting";

  return (
    <div style={rootStyle}>
      <Sidebar
        sidebarTab={s.sidebarTab}
        collections={s.collections}
        history={s.history}
        onCollTab={() => patch({ sidebarTab: "collections" })}
        onHistTab={() => patch({ sidebarTab: "history" })}
        onSave={saveCollection}
        onLoadCollection={loadCollection}
        onDeleteCollection={deleteCollection}
        onLoadHistory={loadHistory}
        onClearHistory={clearHistory}
      />

      <main style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <ConnectionBar
          protocol={s.protocol}
          url={s.url}
          status={s.status}
          statusText={s.statusText}
          latency={s.latency}
          settings={s.settings}
          connected={connected}
          busy={busy}
          onProtocol={(p) => patch({ protocol: p })}
          onUrl={setField("url")}
          onToggleConnect={connected || busy ? () => disconnect(false) : connect}
          onAccent={(accent) => patch({ settings: { ...s.settings, accent } })}
          onDensity={(density) => patch({ settings: { ...s.settings, density } })}
        />

        <div
          ref={splitElRef}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "row",
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <Composer
            state={s}
            setField={setField}
            setHeader={setHeader}
            addHeader={addHeader}
            removeHeader={removeHeader}
            onProtoModel={(m) => patch({ rsModel: m })}
            wsSend={wsSend}
            stompSubscribe={stompSubscribe}
            stompSend={stompSend}
            rsRequest={rsRequest}
            rsChannelPush={rsChannelPush}
            rsChannelComplete={rsChannelComplete}
          />

          <div
            className="sb-divider"
            onMouseDown={onDragStart}
            style={{
              flex: "none",
              width: "7px",
              cursor: "col-resize",
              background: "#0b0e13",
              borderLeft: "1px solid #1c232f",
              borderRight: "1px solid #1c232f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ height: "38px", width: "3px", borderRadius: "3px", background: "#2a3340" }} />
          </div>

          <Results
            state={s}
            onTab={(t) => patch({ resultTab: t })}
            onFilter={setField("filterText")}
            onFilterDir={(d) => patch({ filterDir: d })}
            onClear={clearMessages}
            onCancelSub={cancelSub}
            onFillSample={fillSample}
          />
        </div>
      </main>
    </div>
  );
}
