import { useCallback, type CSSProperties } from "react";
import { EndpointList } from "./components/EndpointList";
import { EmptyState } from "./components/EmptyState";
import { ConnectionBar } from "./components/ConnectionBar";
import { Composer } from "./components/Composer";
import { Results } from "./components/Results";
import { useWorkspace } from "./state/useWorkspace";
import {
  type Endpoint,
  DEFAULT_ENDPOINT,
  endpointDisplayName,
  toEndpointConfig,
} from "./state/endpoint";
import { KEYS, write } from "./lib/storage";
import { downloadJson, readJsonFile } from "./lib/download";
import { serializeWorkspace, serializeEndpoint, parseImport, slug, dateStamp } from "./lib/transfer";
import { useConnections } from "./hooks/useConnections";
import { useSplitPane } from "./hooks/useSplitPane";
import { usePersistence } from "./hooks/usePersistence";
import { rootStyle, dividerStyle, dividerHandleStyle } from "./styles";

export function App() {
  const { state, setState, patch, stateRef, updateEndpoint, patchEndpoint } = useWorkspace();
  const active = state.endpoints.find((e) => e.id === state.activeEndpointId) ?? null;

  const saveEndpoints = useCallback(() => {
    const snapshot = stateRef.current;
    write(KEYS.endpoints, snapshot.endpoints.map(toEndpointConfig));
    write(KEYS.activeEndpoint, snapshot.activeEndpointId);
  }, [stateRef]);

  const conn = useConnections({ stateRef, updateEndpoint, patchEndpoint, saveEndpoints });
  const { splitElRef, onDragStart } = useSplitPane(patch);
  usePersistence({ settings: state.settings, saveEndpoints, closeAll: conn.closeAll });

  /* ---------------- endpoint CRUD ---------------- */
  const createEndpoint = useCallback(() => {
    const endpoint = DEFAULT_ENDPOINT();
    setState((prev) => ({
      ...prev,
      endpoints: prev.endpoints.concat([endpoint]),
      activeEndpointId: endpoint.id,
    }));
    saveEndpoints();
  }, [saveEndpoints, setState]);

  const selectEndpoint = (id: string) => {
    patch({ activeEndpointId: id });
    saveEndpoints();
  };
  const renameEndpoint = (id: string, name: string) => {
    patchEndpoint(id, { name });
    saveEndpoints();
  };
  const deleteEndpoint = (id: string) => {
    const endpoint = stateRef.current.endpoints.find((e) => e.id === id);
    if (!endpoint) return;
    if (!window.confirm(`Delete endpoint "${endpointDisplayName(endpoint)}"? This closes its connection.`))
      return;
    conn.disconnect(id, true);
    setState((prev) => {
      const endpoints = prev.endpoints.filter((e) => e.id !== id);
      const activeEndpointId =
        prev.activeEndpointId === id ? (endpoints[0]?.id ?? null) : prev.activeEndpointId;
      return { ...prev, endpoints, activeEndpointId };
    });
    saveEndpoints();
  };

  /* ---------------- file export / import ---------------- */
  const exportWorkspace = useCallback(() => {
    const snapshot = stateRef.current;
    downloadJson(
      `socketbench-workspace-${dateStamp()}.json`,
      serializeWorkspace(snapshot.endpoints, snapshot.settings),
    );
  }, [stateRef]);

  const exportEndpoint = useCallback(
    (id: string) => {
      const endpoint = stateRef.current.endpoints.find((e) => e.id === id);
      if (!endpoint) return;
      downloadJson(
        `socketbench-${slug(endpointDisplayName(endpoint))}-${dateStamp()}.json`,
        serializeEndpoint(endpoint),
      );
    },
    [stateRef],
  );

  const importFromFile = useCallback(
    (file: File) => {
      readJsonFile(file)
        .then((data) => {
          const imported = parseImport(data);
          if (!imported.length) {
            window.alert("That file contains no endpoints.");
            return;
          }
          // Compute from the current ref so we can persist the merged result
          // directly — stateRef.current only updates after the next render.
          const endpoints = stateRef.current.endpoints.concat(imported);
          const activeEndpointId = imported[0].id;
          setState((prev) => ({
            ...prev,
            endpoints: prev.endpoints.concat(imported),
            activeEndpointId,
          }));
          write(KEYS.endpoints, endpoints.map(toEndpointConfig));
          write(KEYS.activeEndpoint, activeEndpointId);
        })
        .catch((error) =>
          window.alert(error instanceof Error ? error.message : "Could not import that file."),
        );
    },
    [stateRef, setState],
  );

  /* ---------------- active-endpoint field setters ---------------- */
  const setField =
    (field: keyof Endpoint) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (active) patchEndpoint(active.id, { [field]: event.target.value } as Partial<Endpoint>);
    };
  const setFieldValue = (field: keyof Endpoint) => (value: string) => {
    if (active) patchEndpoint(active.id, { [field]: value } as Partial<Endpoint>);
  };
  const setFieldBool = (field: keyof Endpoint) => (value: boolean) => {
    if (active) patchEndpoint(active.id, { [field]: value } as Partial<Endpoint>);
  };
  const setHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", index: number, column: "key" | "value") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!active) return;
      const value = event.target.value;
      updateEndpoint(active.id, (e) => {
        const rows = e[field].slice();
        rows[index] = { ...rows[index], [column]: value };
        return { ...e, [field]: rows };
      });
    };
  const addHeader = (field: "stompConnectHeaders" | "stompSendHeaders") => () => {
    if (active)
      updateEndpoint(active.id, (e) => ({ ...e, [field]: e[field].concat([{ key: "", value: "" }]) }));
  };
  const removeHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", index: number) => () => {
      if (active)
        updateEndpoint(active.id, (e) => {
          const rows = e[field].filter((_, position) => position !== index);
          return { ...e, [field]: rows.length ? rows : [{ key: "", value: "" }] };
        });
    };

  const connected = active?.status === "open";
  const busy = active?.status === "connecting";
  const root: CSSProperties = rootStyle(state.settings);

  return (
    <div style={root}>
      <EndpointList
        endpoints={state.endpoints}
        activeId={state.activeEndpointId}
        onSelect={selectEndpoint}
        onCreate={createEndpoint}
        onRename={renameEndpoint}
        onDelete={deleteEndpoint}
        onExportWorkspace={exportWorkspace}
        onExportEndpoint={exportEndpoint}
        onImport={importFromFile}
      />

      {active ? (
        <main key={active.id} style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <ConnectionBar
            protocol={active.protocol}
            url={active.url}
            status={active.status}
            statusText={active.statusText}
            latency={active.latency}
            settings={state.settings}
            connected={!!connected}
            busy={!!busy}
            onProtocol={(protocol) => patchEndpoint(active.id, { protocol })}
            onUrl={setField("url")}
            onToggleConnect={
              connected || busy ? () => conn.disconnect(active.id, false) : () => conn.connect(active.id)
            }
            onAccent={(accent) => patch({ settings: { ...state.settings, accent } })}
            onDensity={(density) => patch({ settings: { ...state.settings, density } })}
          />

          <div
            ref={splitElRef}
            style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0, minWidth: 0 }}
          >
            <Composer
              endpoint={active}
              splitW={state.splitW}
              setField={setField}
              setFieldValue={setFieldValue}
              setHeader={setHeader}
              addHeader={addHeader}
              removeHeader={removeHeader}
              setFieldBool={setFieldBool}
              fixSend={() => conn.fixSend(active.id)}
              onProtoModel={(model) => patchEndpoint(active.id, { rsModel: model })}
              wsSend={() => conn.wsSend(active.id)}
              stompSubscribe={() => conn.stompSubscribe(active.id)}
              stompSend={() => conn.stompSend(active.id)}
              rsRequest={() => conn.rsRequest(active.id)}
              rsChannelPush={() => conn.rsChannelPush(active.id)}
              rsChannelComplete={() => conn.rsChannelComplete(active.id)}
            />

            <div className="sb-divider" onMouseDown={onDragStart} style={dividerStyle}>
              <div style={dividerHandleStyle} />
            </div>

            <Results
              endpoint={active}
              onTab={(tab) => patchEndpoint(active.id, { resultTab: tab })}
              onFilter={setField("filterText")}
              onFilterDir={(direction) => patchEndpoint(active.id, { filterDir: direction })}
              onClear={() => conn.clearMessages(active.id)}
              onCancelSub={(sub) => conn.cancelSub(active.id, sub)}
              onFillSample={() =>
                patchEndpoint(active.id, { protocol: "ws", url: "wss://ws.postman-echo.com/raw" })
              }
            />
          </div>
        </main>
      ) : (
        <EmptyState onCreate={createEndpoint} onImport={importFromFile} />
      )}
    </div>
  );
}
