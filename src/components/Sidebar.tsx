import type { Collection, HistoryItem, SidebarTab } from "../types";
import { badge, fmtTime, MONO, sideTab } from "../styles";

interface Props {
  sidebarTab: SidebarTab;
  collections: Collection[];
  history: HistoryItem[];
  onCollTab: () => void;
  onHistTab: () => void;
  onSave: () => void;
  onLoadCollection: (collection: Collection) => () => void;
  onDeleteCollection: (collection: Collection) => (event: React.MouseEvent) => void;
  onLoadHistory: (entry: HistoryItem) => () => void;
  onClearHistory: () => void;
}

export function Sidebar(props: Props) {
  const isCollections = props.sidebarTab === "collections";
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
          <div
            style={{
              font: "700 15px " + MONO,
              letterSpacing: ".02em",
              color: "#eef2f7",
            }}
          >
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

      <div style={{ display: "flex", gap: "4px", padding: "10px 12px 4px" }}>
        <button onClick={props.onCollTab} style={sideTab(isCollections)}>
          Collections
        </button>
        <button onClick={props.onHistTab} style={sideTab(!isCollections)}>
          History
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", minHeight: 0 }}>
        {isCollections ? (
          <>
            <button
              onClick={props.onSave}
              className="sb-hover-border"
              style={{
                width: "100%",
                marginBottom: "9px",
                background: "transparent",
                border: "1px dashed #2a3340",
                borderRadius: "8px",
                padding: "9px",
                color: "#8a93a4",
                font: "600 11.5px 'IBM Plex Sans'",
                cursor: "pointer",
              }}
            >
              + Save current endpoint
            </button>
            {props.collections.length === 0 ? (
              <div
                style={{
                  padding: "18px 10px",
                  textAlign: "center",
                  color: "#4a525f",
                  fontSize: "11.5px",
                  lineHeight: 1.6,
                }}
              >
                No saved connections yet.
                <br />
                Connect, then save.
              </div>
            ) : null}
            {props.collections.map((collection) => (
              <div
                key={collection.id}
                className="sb-row"
                onClick={props.onLoadCollection(collection)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  padding: "9px 10px",
                  borderRadius: "8px",
                  marginBottom: "4px",
                  cursor: "pointer",
                  border: "1px solid transparent",
                }}
              >
                <span style={badge(collection.protocol)}>{collection.protocol.toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: "600 13px " + MONO,
                      color: "#dce1ea",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {collection.name}
                  </div>
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
                    {collection.url}
                  </div>
                </div>
                <span
                  onClick={props.onDeleteCollection(collection)}
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
            ))}
          </>
        ) : (
          <>
            {props.history.length > 0 ? (
              <button
                onClick={props.onClearHistory}
                className="sb-danger"
                style={{
                  width: "100%",
                  marginBottom: "9px",
                  background: "transparent",
                  border: "1px solid #1e2632",
                  borderRadius: "8px",
                  padding: "7px",
                  color: "#8a93a4",
                  font: "600 11px 'IBM Plex Sans'",
                  cursor: "pointer",
                }}
              >
                Clear history
              </button>
            ) : (
              <div
                style={{
                  padding: "18px 10px",
                  textAlign: "center",
                  color: "#4a525f",
                  fontSize: "11.5px",
                  lineHeight: 1.6,
                }}
              >
                Connections &amp; sends
                <br />
                show up here.
              </div>
            )}
            {props.history.map((entry) => (
              <div
                key={entry.id}
                className="sb-row"
                onClick={props.onLoadHistory(entry)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  marginBottom: "3px",
                  cursor: "pointer",
                  border: "1px solid transparent",
                }}
              >
                <span style={badge(entry.protocol)}>{entry.protocol.toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: "12px " + MONO,
                      color: "#c4ccd8",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.url}
                  </div>
                  <div style={{ fontSize: "10px", color: "#59616f", marginTop: "2px" }}>
                    {entry.action} · {fmtTime(entry.ts)}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
