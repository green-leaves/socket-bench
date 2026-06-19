import { MONO } from "../styles";
import { ImportButton } from "./ImportButton";

export function EmptyState({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: (file: File) => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0c10",
        minHeight: 0,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "420px", padding: "30px" }}>
        <div style={{ font: "700 15px " + MONO, color: "#8a93a4", marginBottom: "12px" }}>
          No endpoints yet
        </div>
        <div style={{ font: "13px/1.7 'IBM Plex Sans'", color: "#5a6270", marginBottom: "22px" }}>
          Create an endpoint to connect over WebSocket, STOMP, or RSocket. Each endpoint keeps its
          own connection and message log.
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            onClick={onCreate}
            className="sb-brighten"
            style={{
              background: "var(--accent,#2dd4a7)",
              border: "none",
              borderRadius: "8px",
              padding: "11px 20px",
              color: "#06120d",
              font: "600 13px 'IBM Plex Sans'",
              cursor: "pointer",
            }}
          >
            + Create your first endpoint
          </button>
          <ImportButton
            onImport={onImport}
            className="sb-soft-btn"
            style={{
              background: "transparent",
              border: "1px solid #2a3340",
              borderRadius: "8px",
              padding: "11px 18px",
              color: "#8a93a4",
              font: "600 13px 'IBM Plex Sans'",
              cursor: "pointer",
            }}
          >
            ⤒ Import a file
          </ImportButton>
        </div>
        <div
          style={{
            marginTop: "14px",
            font: "11px/1.6 'IBM Plex Sans'",
            color: "#454c57",
          }}
        >
          Import a saved workspace or endpoint file to restore a backup or load a shared collection.
        </div>
      </div>
    </div>
  );
}
