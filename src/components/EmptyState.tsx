import { MONO } from "../styles";

export function EmptyState({ onCreate }: { onCreate: () => void }) {
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
      </div>
    </div>
  );
}
