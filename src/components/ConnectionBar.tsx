import type { CSSProperties } from "react";
import type { Density, Protocol, Settings, Status } from "../types";
import { FAM, MONO, seg, statusColors } from "../styles";

interface Props {
  protocol: Protocol;
  url: string;
  status: Status;
  statusText: string;
  latency: number | null;
  settings: Settings;
  connected: boolean;
  busy: boolean;
  onProtocol: (protocol: Protocol) => void;
  onUrl: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleConnect: () => void;
  onAccent: (accent: string) => void;
  onDensity: (density: Density) => void;
}

const PROTOS: { value: Protocol; label: string }[] = [
  { value: "ws", label: "WebSocket" },
  { value: "stomp", label: "STOMP" },
  { value: "rsocket", label: "RSocket" },
];

export function ConnectionBar(props: Props) {
  const accent = props.settings.accent;
  const statusColor = statusColors[props.status] || "#59616f";

  const connectBtnStyle: CSSProperties = {
    padding: "9px 18px",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "12.5px",
    fontFamily: FAM,
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: props.connected || props.busy ? "1px solid #ff7b72" : "1px solid transparent",
    background: props.connected || props.busy ? "transparent" : "var(--accent,#2dd4a7)",
    color: props.connected || props.busy ? "#ff7b72" : "#06120d",
  };

  const densityBtn = (active: boolean): CSSProperties => ({
    padding: "5px 9px",
    borderRadius: "5px",
    fontWeight: 600,
    fontSize: "10.5px",
    fontFamily: FAM,
    cursor: "pointer",
    border: active ? "1px solid transparent" : "1px solid #2a3340",
    background: active ? "var(--accent,#2dd4a7)" : "transparent",
    color: active ? "#06120d" : "#8a93a4",
  });

  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: "11px",
        padding: "11px 16px",
        borderBottom: "1px solid #1c232f",
        background: "#0b0e13",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "3px",
          background: "#0c0f15",
          border: "1px solid #1c232f",
          borderRadius: "9px",
          padding: "3px",
        }}
      >
        {PROTOS.map((option) => (
          <button
            key={option.value}
            onClick={() => props.onProtocol(option.value)}
            style={seg(props.protocol === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <input
        value={props.url}
        onChange={props.onUrl}
        placeholder="wss://example.com/ws"
        spellCheck={false}
        className="sb-input"
        style={{
          flex: 1,
          minWidth: "120px",
          background: "#0c0f15",
          border: "1px solid #1c232f",
          borderRadius: "8px",
          padding: "9px 12px",
          color: "#dce1ea",
          font: "13px " + MONO,
          outline: "none",
        }}
      />

      <button onClick={props.onToggleConnect} className="sb-brighten" style={connectBtnStyle}>
        {props.busy ? "Connecting…" : props.connected ? "Disconnect" : "Connect"}
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          paddingLeft: "4px",
          minWidth: "128px",
        }}
      >
        <span
          style={{
            width: "9px",
            height: "9px",
            borderRadius: "50%",
            flex: "none",
            background: statusColor,
            animation: props.busy ? "sb-pulse 1.1s infinite" : "none",
            boxShadow: props.connected ? "0 0 9px var(--accent,#2dd4a7)" : "none",
          }}
        />
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ font: "600 11.5px 'IBM Plex Sans'", color: "#c4ccd8" }}>
            {props.statusText}
          </div>
          {props.latency != null ? (
            <div style={{ font: "11px " + MONO, color: "var(--accent,#2dd4a7)" }}>
              {props.latency} ms RTT
            </div>
          ) : null}
        </div>
      </div>

      {/* tweaks: accent + density (the design's editor props, surfaced in-app) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          paddingLeft: "10px",
          marginLeft: "2px",
          borderLeft: "1px solid #1c232f",
        }}
      >
        <label
          title="Accent color"
          style={{
            position: "relative",
            width: "22px",
            height: "22px",
            borderRadius: "6px",
            border: "1px solid #2a3340",
            background: accent,
            cursor: "pointer",
            flex: "none",
            boxShadow: "0 0 8px " + accent + "55",
            overflow: "hidden",
          }}
        >
          <input
            type="color"
            value={accent}
            onChange={(event) => props.onAccent(event.target.value)}
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              cursor: "pointer",
              border: "none",
              padding: 0,
            }}
          />
        </label>
        <div style={{ display: "flex", gap: "3px" }}>
          <button onClick={() => props.onDensity("comfortable")} style={densityBtn(props.settings.density === "comfortable")}>
            Cozy
          </button>
          <button onClick={() => props.onDensity("compact")} style={densityBtn(props.settings.density === "compact")}>
            Compact
          </button>
        </div>
      </div>
    </div>
  );
}
