import { memo, type CSSProperties } from "react";
import type { Endpoint } from "../state/endpoint";
import type { FilterDir, Message, Subscription } from "../types";
import { dirMeta, fmtTime, MONO, pill, seg } from "../styles";
import { util } from "../lib/clients";
import { JsonView, PlainView } from "./JsonView";

interface Props {
  endpoint: Endpoint;
  onTab: (tab: "messages" | "raw" | "metrics") => void;
  onFilter: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFilterDir: (direction: FilterDir) => void;
  onClear: () => void;
  onCancelSub: (sub: Subscription) => () => void;
  onFillSample: () => void;
}

const RESULT_TABS: { value: "messages" | "raw" | "metrics"; label: string }[] = [
  { value: "messages", label: "Messages" },
  { value: "raw", label: "Raw" },
  { value: "metrics", label: "Metrics" },
];
const FILTER_DIRS: { value: FilterDir; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in", label: "In" },
  { value: "out", label: "Out" },
  { value: "sys", label: "Sys" },
];

const MessageCard = memo(function MessageCard({ message }: { message: Message }) {
  const dirStyle = dirMeta[message.dir] || dirMeta.sys;
  const accentColor = message.kind === "err" ? "#ff7b72" : dirStyle.color;
  const bg =
    message.kind === "err"
      ? "rgba(255,123,114,.12)"
      : message.dir === "in"
        ? "rgba(88,166,255,.13)"
        : message.dir === "out"
          ? "rgba(45,212,167,.14)"
          : "rgba(167,139,250,.13)";
  return (
    <div
      style={{
        border: "1px solid #1c232f",
        borderLeft: "3px solid " + accentColor,
        background: "#0c1016",
        borderRadius: "9px",
        padding: "10px 13px",
        display: "flex",
        flexDirection: "column",
        gap: "7px",
        animation: "sb-in .18s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          style={{
            flex: "none",
            fontWeight: 700,
            fontSize: "9.5px",
            fontFamily: MONO,
            letterSpacing: ".12em",
            padding: "3px 7px",
            borderRadius: "4px",
            color: accentColor,
            background: bg,
          }}
        >
          {message.kind === "err" ? "ERR" : dirStyle.label}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            font: "12.5px " + MONO,
            color: "#9aa3b2",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {message.label || ""}
        </span>
        {message.latency != null ? (
          <span style={{ font: "11px " + MONO, color: "var(--accent,#2dd4a7)" }}>
            {message.latency} ms
          </span>
        ) : null}
        <span style={{ font: "11px " + MONO, color: "#4a525f" }}>{util.formatBytes(message.size)}</span>
        <span style={{ font: "11px " + MONO, color: "#4a525f" }}>{fmtTime(message.ts)}</span>
      </div>
      {message.isJson ? <JsonView pretty={message.pretty} /> : <PlainView text={message.raw} />}
    </div>
  );
});

const Metrics = memo(function Metrics({ messages }: { messages: Message[] }) {
  let inboundCount = 0,
    outboundCount = 0,
    errorCount = 0,
    bytesIn = 0,
    bytesOut = 0;
  const latencies: number[] = [];
  messages.forEach((message) => {
    if (message.dir === "in") {
      inboundCount++;
      bytesIn += message.size || 0;
    } else if (message.dir === "out") {
      outboundCount++;
      bytesOut += message.size || 0;
    }
    if (message.kind === "err") errorCount++;
    if (message.latency != null) latencies.push(message.latency);
  });
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null;
  const currentMs = Date.now();
  const buckets = new Array(30).fill(0);
  messages.forEach((message) => {
    const age = Math.floor((currentMs - message.ts) / 1000);
    if (age >= 0 && age < 30) buckets[29 - age]++;
  });
  const maxBucket = Math.max(1, ...buckets);
  const rate = (buckets.slice(-5).reduce((sum, value) => sum + value, 0) / 5).toFixed(1);

  const card: CSSProperties = {
    background: "#0b0e13",
    border: "1px solid #1c232f",
    borderRadius: "10px",
    padding: "14px 16px",
  };
  const capLabel: CSSProperties = {
    font: "600 10px 'IBM Plex Sans'",
    letterSpacing: ".1em",
    textTransform: "uppercase",
    color: "#59616f",
  };
  const bigNum: CSSProperties = { font: "700 26px " + MONO, marginTop: "4px" };

  return (
    <div style={{ padding: "18px 16px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: "11px",
          marginBottom: "18px",
        }}
      >
        <div style={card}>
          <div style={capLabel}>Messages</div>
          <div style={{ ...bigNum, color: "#eef2f7" }}>{messages.length}</div>
        </div>
        <div style={card}>
          <div style={capLabel}>In / Out</div>
          <div style={bigNum}>
            <span style={{ color: "#58a6ff" }}>{inboundCount}</span>
            <span style={{ color: "#3f4754" }}> / </span>
            <span style={{ color: "var(--accent,#2dd4a7)" }}>{outboundCount}</span>
          </div>
        </div>
        <div style={card}>
          <div style={capLabel}>Avg latency</div>
          <div style={{ ...bigNum, color: "#eef2f7" }}>{avgLatency != null ? avgLatency + " ms" : "—"}</div>
        </div>
        <div style={card}>
          <div style={capLabel}>Errors</div>
          <div style={{ ...bigNum, color: "#ff7b72" }}>{errorCount}</div>
        </div>
        <div style={card}>
          <div style={capLabel}>Bytes in / out</div>
          <div style={{ font: "700 17px " + MONO, color: "#c4ccd8", marginTop: "8px" }}>
            {util.formatBytes(bytesIn)} <span style={{ color: "#3f4754" }}>/</span>{" "}
            {util.formatBytes(bytesOut)}
          </div>
        </div>
      </div>
      <div style={{ ...card, padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={capLabel}>Throughput · last 30s</div>
          <div style={{ font: "600 12px 'IBM Plex Sans'", color: "#8a93a4" }}>
            ~{rate} <span style={{ color: "#59616f" }}>msg/s</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "96px" }}>
          {buckets.map((count, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: "2px 2px 0 0",
                background: count > 0 ? "var(--accent,#2dd4a7)" : "#161d27",
                height: Math.max(2, (count / maxBucket) * 100) + "%",
                transition: "height .25s",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export function Results({ endpoint, ...props }: Props) {
  const filterQuery = (endpoint.filterText || "").toLowerCase();
  const filtered = endpoint.messages.filter(
    (message) =>
      (endpoint.filterDir === "all" || message.dir === endpoint.filterDir) &&
      (!filterQuery ||
        message.raw.toLowerCase().indexOf(filterQuery) > -1 ||
        (message.label || "").toLowerCase().indexOf(filterQuery) > -1),
  );

  const rawDump =
    endpoint.messages
      .slice()
      .reverse()
      .map((message) => {
        const dirStyle = dirMeta[message.dir] || dirMeta.sys;
        const tag = message.kind === "err" ? "ERR" : dirStyle.label;
        return (
          "[" +
          fmtTime(message.ts) +
          "] " +
          tag +
          (tag.length < 3 ? " " : "") +
          " " +
          (message.label ? "(" + message.label + ") " : "") +
          "· " +
          util.formatBytes(message.size) +
          "\n" +
          message.raw
        );
      })
      .join("\n\n") || "— no frames —";

  return (
    <div
      data-screen-label="Results"
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#0a0c10" }}
    >
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: "11px",
          padding: "10px 16px",
          borderBottom: "1px solid #1c232f",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "3px", background: "#0c0f15", border: "1px solid #1c232f", borderRadius: "9px", padding: "3px" }}>
          {RESULT_TABS.map((option) => (
            <button key={option.value} onClick={() => props.onTab(option.value)} style={seg(endpoint.resultTab === option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <span style={{ font: "11.5px " + MONO, color: "#59616f" }}>
          {filtered.length}/{endpoint.messages.length}
        </span>
        <div style={{ flex: 1 }} />
        <input
          value={endpoint.filterText}
          onChange={props.onFilter}
          placeholder="filter…"
          spellCheck={false}
          className="sb-input"
          style={{ width: "160px", background: "#0c0f15", border: "1px solid #1c232f", borderRadius: "7px", padding: "6px 11px", color: "#dce1ea", font: "12px " + MONO, outline: "none" }}
        />
        <div style={{ display: "flex", gap: "4px" }}>
          {FILTER_DIRS.map((option) => (
            <button key={option.value} onClick={() => props.onFilterDir(option.value)} style={pill(endpoint.filterDir === option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <button
          onClick={props.onClear}
          className="sb-danger"
          style={{ background: "transparent", border: "1px solid #1e2632", borderRadius: "7px", padding: "6px 12px", color: "#8a93a4", font: "600 11.5px 'IBM Plex Sans'", cursor: "pointer" }}
        >
          Clear
        </button>
      </div>

      {endpoint.subscriptions.length > 0 && (
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderBottom: "1px solid #1c232f",
            background: "#0b0e13",
            flexWrap: "wrap",
          }}
        >
          <span style={{ font: "700 9.5px " + MONO, letterSpacing: ".12em", color: "#59616f" }}>
            ACTIVE
          </span>
          {endpoint.subscriptions.map((sub) => (
            <div
              key={String(sub.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                background: "#11161e",
                border: "1px solid #232c39",
                borderRadius: "20px",
                padding: "4px 6px 4px 11px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--accent,#2dd4a7)",
                  animation: "sb-pulse 1.6s infinite",
                }}
              />
              <span style={{ font: "12px " + MONO, color: "#c4ccd8" }}>{sub.label}</span>
              <span
                onClick={props.onCancelSub(sub)}
                className="sb-cancel"
                style={{ cursor: "pointer", color: "#59616f", fontSize: "15px", lineHeight: 1, padding: "0 4px", borderRadius: "50%" }}
              >
                ×
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {endpoint.resultTab === "messages" &&
          (endpoint.messages.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px" }}>
              <div style={{ maxWidth: "440px", textAlign: "center" }}>
                <div style={{ font: "700 14px " + MONO, color: "#8a93a4", marginBottom: "14px" }}>
                  Awaiting frames
                </div>
                <div style={{ font: "13px/1.7 'IBM Plex Sans'", color: "#5a6270", marginBottom: "20px" }}>
                  Pick a protocol, enter an endpoint, hit{" "}
                  <span style={{ color: "var(--accent,#2dd4a7)", fontWeight: 600 }}>Connect</span>, then
                  send. Incoming messages stream here newest-first.
                </div>
                <button
                  onClick={props.onFillSample}
                  className="sb-sample"
                  style={{ background: "#11161e", border: "1px solid #232c39", borderRadius: "8px", padding: "9px 15px", color: "#c4ccd8", font: "13px " + MONO, cursor: "pointer" }}
                >
                  Try wss://ws.postman-echo.com/raw
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px", padding: "14px 16px" }}>
              {filtered.map((message) => (
                <MessageCard key={message.id} message={message} />
              ))}
            </div>
          ))}

        {endpoint.resultTab === "raw" && (
          <pre
            style={{
              margin: 0,
              padding: "16px",
              font: "12px/1.6 " + MONO,
              color: "#9aa3b2",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {rawDump}
          </pre>
        )}

        {endpoint.resultTab === "metrics" && <Metrics messages={endpoint.messages} />}
      </div>
    </div>
  );
}
