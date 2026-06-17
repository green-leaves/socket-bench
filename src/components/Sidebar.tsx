import type { Collection, HistoryItem, SidebarTab } from "../types";
import { badge, fmtTime, MONO, sideTab } from "../styles";

interface Props {
  sidebarTab: SidebarTab;
  collections: Collection[];
  history: HistoryItem[];
  onCollTab: () => void;
  onHistTab: () => void;
  onSave: () => void;
  onLoadCollection: (c: Collection) => () => void;
  onDeleteCollection: (c: Collection) => (e: React.MouseEvent) => void;
  onLoadHistory: (h: HistoryItem) => () => void;
  onClearHistory: () => void;
}

export function Sidebar(p: Props) {
  const isColl = p.sidebarTab === "collections";
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
        <button onClick={p.onCollTab} style={sideTab(isColl)}>
          Collections
        </button>
        <button onClick={p.onHistTab} style={sideTab(!isColl)}>
          History
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", minHeight: 0 }}>
        {isColl ? (
          <>
            <button
              onClick={p.onSave}
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
            {p.collections.length === 0 ? (
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
            {p.collections.map((c) => (
              <div
                key={c.id}
                className="sb-row"
                onClick={p.onLoadCollection(c)}
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
                <span style={badge(c.protocol)}>{c.protocol.toUpperCase()}</span>
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
                    {c.name}
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
                    {c.url}
                  </div>
                </div>
                <span
                  onClick={p.onDeleteCollection(c)}
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
            {p.history.length > 0 ? (
              <button
                onClick={p.onClearHistory}
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
            {p.history.map((h) => (
              <div
                key={h.id}
                className="sb-row"
                onClick={p.onLoadHistory(h)}
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
                <span style={badge(h.protocol)}>{h.protocol.toUpperCase()}</span>
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
                    {h.url}
                  </div>
                  <div style={{ fontSize: "10px", color: "#59616f", marginTop: "2px" }}>
                    {h.action} · {fmtTime(h.ts)}
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
