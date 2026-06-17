import { useCallback, type CSSProperties } from "react";
import { Sidebar } from "./components/Sidebar";
import { ConnectionBar } from "./components/ConnectionBar";
import { Composer } from "./components/Composer";
import { Results } from "./components/Results";
import { useAppState } from "./state/useAppState";
import { FORM_KEYS } from "./state/appState";
import { KEYS, write } from "./lib/storage";
import { useMessageLog } from "./hooks/useMessageLog";
import { useHistory } from "./hooks/useHistory";
import { useSocketConnection } from "./hooks/useSocketConnection";
import { useCollections } from "./hooks/useCollections";
import { useHeaderRows } from "./hooks/useHeaderRows";
import { useSplitPane } from "./hooks/useSplitPane";
import { usePersistence } from "./hooks/usePersistence";
import { rootStyle, dividerStyle, dividerHandleStyle } from "./styles";
import type { AppState } from "./state/appState";

export function App() {
  const { state, setState, patch, stateRef } = useAppState();

  const saveForm = useCallback(() => {
    const snapshot = stateRef.current;
    const form: Record<string, unknown> = {};
    FORM_KEYS.forEach((key) => (form[key] = snapshot[key]));
    write(KEYS.form, form);
  }, [stateRef]);

  const { addMsg, err, clearMessages } = useMessageLog(setState);
  const { pushHistory, loadHistory, clearHistory } = useHistory(setState, stateRef);
  const conn = useSocketConnection({ patch, setState, stateRef, addMsg, err, pushHistory, saveForm });
  const { saveCollection, loadCollection, deleteCollection } = useCollections({
    setState, stateRef, patch, err,
  });
  const { setHeader, addHeader, removeHeader } = useHeaderRows(setState);
  const { splitElRef, onDragStart } = useSplitPane(patch);
  usePersistence({
    collections: state.collections,
    history: state.history,
    settings: state.settings,
    saveForm,
    clientRef: conn.clientRef,
  });

  const setField =
    (field: keyof AppState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patch({ [field]: event.target.value } as Partial<AppState>);

  const fillSample = () => patch({ protocol: "ws", url: "wss://ws.postman-echo.com/raw" });
  const connected = state.status === "open";
  const busy = state.status === "connecting";
  const root: CSSProperties = rootStyle(state.settings);

  return (
    <div style={root}>
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
          style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0, minWidth: 0 }}
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

          <div className="sb-divider" onMouseDown={onDragStart} style={dividerStyle}>
            <div style={dividerHandleStyle} />
          </div>

          <Results
            state={state}
            onTab={(tab) => patch({ resultTab: tab })}
            onFilter={setField("filterText")}
            onFilterDir={(direction) => patch({ filterDir: direction })}
            onClear={clearMessages}
            onCancelSub={conn.cancelSub}
            onFillSample={fillSample}
          />
        </div>
      </main>
    </div>
  );
}
