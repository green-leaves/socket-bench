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
  const { state, setState, patch, stateRef } = useAppState();
  const { addMsg, err, clearMessages } = useMessageLog(setState);
  const { pushHistory, loadHistory, clearHistory } = useHistory(setState, stateRef);

  const splitElRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  /* ---------------- persistence ---------------- */
  useEffect(() => write(KEYS.collections, state.collections), [state.collections]);
  useEffect(() => write(KEYS.history, state.history), [state.history]);
  useEffect(() => write(KEYS.settings, state.settings), [state.settings]);

  const saveForm = useCallback(() => {
    const snapshot = stateRef.current;
    const form: Record<string, unknown> = {};
    FORM_KEYS.forEach((key) => (form[key] = snapshot[key]));
    write(KEYS.form, form);
  }, []);

  const conn = useSocketConnection({
    patch, setState, stateRef, addMsg, err, pushHistory, saveForm,
  });

  /* ---------------- drag + lifecycle ---------------- */
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current || !splitElRef.current) return;
      const rect = splitElRef.current.getBoundingClientRect();
      const width = event.clientX - rect.left;
      patch({ splitW: Math.max(320, Math.min(rect.width - 360, width)) });
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("beforeunload", saveForm);
    return () => {
      saveForm();
      const client = conn.clientRef.current;
      if (client)
        try {
          client.close();
        } catch {
          /* ignore */
        }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("beforeunload", saveForm);
    };
  }, [patch, saveForm]);

  const onDragStart = (event: React.MouseEvent) => {
    draggingRef.current = true;
    event.preventDefault();
  };

  /* ---------------- messages ---------------- */
  const fillSample = () =>
    patch({ protocol: "ws", url: "wss://ws.postman-echo.com/raw" });

  /* ---------------- header editors ---------------- */
  const setHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", index: number, column: "key" | "value") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setState((prev) => {
        const rows = prev[field].slice();
        rows[index] = { ...rows[index], [column]: value };
        return { ...prev, [field]: rows };
      });
    };
  const addHeader = (field: "stompConnectHeaders" | "stompSendHeaders") => () =>
    setState((prev) => ({ ...prev, [field]: prev[field].concat([{ key: "", value: "" }]) }));
  const removeHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", index: number) => () =>
      setState((prev) => {
        const rows = prev[field].filter((_, position) => position !== index);
        return { ...prev, [field]: rows.length ? rows : [{ key: "", value: "" }] };
      });

  /* ---------------- collections / history ---------------- */
  const defaultName = () => {
    const snapshot = stateRef.current;
    if (snapshot.protocol === "stomp")
      return leaf(snapshot.stompSubDest) || leaf(snapshot.stompSendDest) || "subscription";
    if (snapshot.protocol === "rsocket") return (snapshot.rsRoute || "").trim() || "route";
    const leafName = leaf((snapshot.url || "").replace(/^wss?:\/\//, "").split("?")[0]);
    return leafName || "connection";
  };
  const saveCollection = () => {
    const snapshot = stateRef.current;
    if (!snapshot.url.trim()) {
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
      protocol: snapshot.protocol,
      url: snapshot.url,
      meta: { stompDest: snapshot.stompSubDest, rsRoute: snapshot.rsRoute, rsModel: snapshot.rsModel },
    };
    setState((prev) => ({ ...prev, collections: prev.collections.concat([item]) }));
  };
  const loadCollection = (collection: Collection) => () => {
    const updates: Partial<AppState> = { protocol: collection.protocol, url: collection.url };
    if (collection.meta) {
      if (collection.protocol === "stomp" && collection.meta.stompDest) updates.stompSubDest = collection.meta.stompDest;
      if (collection.protocol === "rsocket") {
        if (collection.meta.rsRoute) updates.rsRoute = collection.meta.rsRoute;
        if (collection.meta.rsModel) updates.rsModel = collection.meta.rsModel;
      }
    }
    patch(updates);
  };
  const deleteCollection = (collection: Collection) => (event: React.MouseEvent) => {
    if (event && event.stopPropagation) event.stopPropagation();
    setState((prev) => ({
      ...prev,
      collections: prev.collections.filter((item) => item.id !== collection.id),
    }));
  };
  /* ---------------- form field setter ---------------- */
  const setField =
    (field: keyof AppState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patch({ [field]: event.target.value } as Partial<AppState>);

  /* ---------------- theme + derived ---------------- */
  const compact = state.settings.density === "compact";
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
    ["--accent" as never]: state.settings.accent,
    ["--pad-y" as never]: compact ? "6px" : "9px",
    ["--fs" as never]: compact ? "12px" : "12.5px",
    ["--gap" as never]: "12px",
  };

  const connected = state.status === "open";
  const busy = state.status === "connecting";

  return (
    <div style={rootStyle}>
      <Sidebar
        sidebarTab={state.sidebarTab}
        collections={state.collections}
        history={state.history}
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
          protocol={state.protocol}
          url={state.url}
          status={state.status}
          statusText={state.statusText}
          latency={state.latency}
          settings={state.settings}
          connected={connected}
          busy={busy}
          onProtocol={(protocol) => patch({ protocol })}
          onUrl={setField("url")}
          onToggleConnect={connected || busy ? () => conn.disconnect(false) : conn.connect}
          onAccent={(accent) => patch({ settings: { ...state.settings, accent } })}
          onDensity={(density) => patch({ settings: { ...state.settings, density } })}
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
            state={state}
            setField={setField}
            setHeader={setHeader}
            addHeader={addHeader}
            removeHeader={removeHeader}
            onProtoModel={(model) => patch({ rsModel: model })}
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
            state={state}
            onTab={(tab) => patch({ resultTab: tab })}
            onFilter={setField("filterText")}
            onFilterDir={(dir) => patch({ filterDir: dir })}
            onClear={clearMessages}
            onCancelSub={conn.cancelSub}
            onFillSample={fillSample}
          />
        </div>
      </main>
    </div>
  );
}
