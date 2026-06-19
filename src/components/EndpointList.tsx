import { useEffect, useRef, useState } from "react";
import { type Endpoint, endpointDisplayName } from "../state/endpoint";
import { badge, statusColors, MONO } from "../styles";

interface Props {
  endpoints: Endpoint[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/** Per-endpoint connection indicator: color by status, pulse when streaming/connecting. */
function StatusDot({ endpoint }: { endpoint: Endpoint }) {
  const color = statusColors[endpoint.status] || "#59616f";
  const pulsing = endpoint.status === "connecting" || endpoint.subscriptions.length > 0;
  return (
    <span
      title={endpoint.statusText}
      style={{
        flex: "none",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: color,
        boxShadow: endpoint.status === "open" ? "0 0 8px " + color : "none",
        animation: pulsing ? "sb-pulse 1.4s infinite" : "none",
      }}
    />
  );
}

function Row({
  endpoint,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  endpoint: Endpoint;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  const commit = () => {
    onRename(endpoint.id, draft.trim());
    setEditing(false);
  };

  return (
    <div
      className="sb-row"
      onClick={() => onSelect(endpoint.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "9px 10px",
        borderRadius: "8px",
        marginBottom: "4px",
        cursor: "pointer",
        border: "1px solid " + (active ? "#232c39" : "transparent"),
        background: active ? "#11161e" : "transparent",
      }}
    >
      <StatusDot endpoint={endpoint} />
      <span style={badge(endpoint.protocol)}>{endpoint.protocol.toUpperCase()}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            style={{
              width: "100%",
              background: "#0c0f15",
              border: "1px solid #2a3340",
              borderRadius: "5px",
              padding: "3px 6px",
              color: "#dce1ea",
              font: "13px " + MONO,
              outline: "none",
            }}
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(endpoint.name);
              setEditing(true);
            }}
            style={{
              font: "600 13px " + MONO,
              color: "#dce1ea",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {endpointDisplayName(endpoint)}
          </div>
        )}
        <div
          style={{
            fontSize: "10px",
            color: "#59616f",
            marginTop: "2px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {endpoint.url || "no URL yet"}
        </div>
      </div>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onDelete(endpoint.id);
        }}
        className="sb-del"
        style={{
          flex: "none",
          color: "#4a525f",
          fontSize: "15px",
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: "4px",
        }}
      >
        ×
      </span>
    </div>
  );
}

export function EndpointList(props: Props) {
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#0b0e13",
        borderRight: "1px solid #1c232f",
        minHeight: 0,
      }}
    >
      <div style={{ padding: "15px 16px 13px", borderBottom: "1px solid #1c232f" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <div
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "3px",
              background: "var(--accent,#2dd4a7)",
              boxShadow: "0 0 12px var(--accent,#2dd4a7)",
            }}
          />
          <div style={{ font: "700 15px " + MONO, letterSpacing: ".02em", color: "#eef2f7" }}>
            socketbench
          </div>
        </div>
        <div
          style={{
            marginTop: "5px",
            font: "500 10.5px 'IBM Plex Sans'",
            color: "#59616f",
            letterSpacing: ".04em",
          }}
        >
          WS · STOMP · RSocket client
        </div>
      </div>

      <div style={{ padding: "10px 12px 4px" }}>
        <button
          onClick={props.onCreate}
          className="sb-hover-border"
          style={{
            width: "100%",
            background: "transparent",
            border: "1px dashed #2a3340",
            borderRadius: "8px",
            padding: "9px",
            color: "#8a93a4",
            font: "600 11.5px 'IBM Plex Sans'",
            cursor: "pointer",
          }}
        >
          + New endpoint
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", minHeight: 0 }}>
        {props.endpoints.map((endpoint) => (
          <Row
            key={endpoint.id}
            endpoint={endpoint}
            active={endpoint.id === props.activeId}
            onSelect={props.onSelect}
            onRename={props.onRename}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </aside>
  );
}
