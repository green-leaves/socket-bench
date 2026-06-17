import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import type {
  Collection,
} from "./types";
import { useMessageLog } from "./hooks/useMessageLog";
import { useHistory } from "./hooks/useHistory";
import { leaf } from "./lib/util";
import { KEYS, write } from "./lib/storage";
import { FAM } from "./styles";
import { Sidebar } from "./components/Sidebar";
import { ConnectionBar } from "./components/ConnectionBar";
import { Composer } from "./components/Composer";
import { Results } from "./components/Results";
import { useAppState } from "./state/useAppState";
import { type AppState, FORM_KEYS } from "./state/appState";
import { useSocketConnection } from "./hooks/useSocketConnection";

export function App() {
  const { s, setS, patch, sRef } = useAppState();
  const { addMsg, err, clearMessages } = useMessageLog(setS);
  const { pushHistory, loadHistory, clearHistory } = useHistory(setS, sRef);

  const splitElRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  /* ---------------- persistence ---------------- */
  useEffect(() => write(KEYS.collections, s.collections), [s.collections]);
  useEffect(() => write(KEYS.history, s.history), [s.history]);
  useEffect(() => write(KEYS.settings, s.settings), [s.settings]);

  const saveForm = useCallback(() => {
    const cur = sRef.current;
    const form: Record<string, unknown> = {};
    FORM_KEYS.forEach((k) => (form[k] = cur[k]));
    write(KEYS.form, form);
  }, []);

  const conn = useSocketConnection({
    patch, setS, sRef, addMsg, err, pushHistory, saveForm,
  });

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
      const c = conn.clientRef.current;
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
  const fillSample = () =>
    patch({ protocol: "ws", url: "wss://ws.postman-echo.com/raw" });

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
          onToggleConnect={connected || busy ? () => conn.disconnect(false) : conn.connect}
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
            wsSend={conn.wsSend}
            stompSubscribe={conn.stompSubscribe}
            stompSend={conn.stompSend}
            rsRequest={conn.rsRequest}
            rsChannelPush={conn.rsChannelPush}
            rsChannelComplete={conn.rsChannelComplete}
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
            onCancelSub={conn.cancelSub}
            onFillSample={fillSample}
          />
        </div>
      </main>
    </div>
  );
}
