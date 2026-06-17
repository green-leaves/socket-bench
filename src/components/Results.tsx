import type { CSSProperties } from "react";
import type { AppState } from "../App";
import type { FilterDir, Message, Subscription } from "../types";
import { dirMeta, fmtTime, MONO, pill, seg } from "../styles";
import { util } from "../lib/clients";
import { JsonView, PlainView } from "./JsonView";

interface Props {
  state: AppState;
  onTab: (t: "messages" | "raw" | "metrics") => void;
  onFilter: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilterDir: (d: FilterDir) => void;
  onClear: () => void;
  onCancelSub: (s: Subscription) => () => void;
  onFillSample: () => void;
}

const RESULT_TABS: { k: "messages" | "raw" | "metrics"; l: string }[] = [
  { k: "messages", l: "Messages" },
  { k: "raw", l: "Raw" },
  { k: "metrics", l: "Metrics" },
];
const FILTER_DIRS: { k: FilterDir; l: string }[] = [
  { k: "all", l: "All" },
  { k: "in", l: "In" },
  { k: "out", l: "Out" },
  { k: "sys", l: "Sys" },
];

function MessageCard({ m }: { m: Message }) {
  const dm = dirMeta[m.dir] || dirMeta.sys;
  const c = m.kind === "err" ? "#ff7b72" : dm.c;
  const bg =
    m.kind === "err"
      ? "rgba(255,123,114,.12)"
      : m.dir === "in"
        ? "rgba(88,166,255,.13)"
        : m.dir === "out"
          ? "rgba(45,212,167,.14)"
          : "rgba(167,139,250,.13)";
  return (
    <div
      style={{
        border: "1px solid #1c232f",
        borderLeft: "3px solid " + c,
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
            color: c,
            background: bg,
          }}
        >
          {m.kind === "err" ? "ERR" : dm.l}
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
          {m.label || ""}
        </span>
        {m.latency != null ? (
          <span style={{ font: "11px " + MONO, color: "var(--accent,#2dd4a7)" }}>
            {m.latency} ms
          </span>
        ) : null}
        <span style={{ font: "11px " + MONO, color: "#4a525f" }}>{util.formatBytes(m.size)}</span>
        <span style={{ font: "11px " + MONO, color: "#4a525f" }}>{fmtTime(m.ts)}</span>
      </div>
      {m.isJson ? <JsonView pretty={m.pretty} /> : <PlainView text={m.raw} />}
    </div>
  );
}

function Metrics({ messages }: { messages: Message[] }) {
  let inC = 0,
    outC = 0,
    errC = 0,
    bIn = 0,
    bOut = 0;
  const lats: number[] = [];
  messages.forEach((m) => {
    if (m.dir === "in") {
      inC++;
      bIn += m.size || 0;
    } else if (m.dir === "out") {
      outC++;
      bOut += m.size || 0;
    }
    if (m.kind === "err") errC++;
    if (m.latency != null) lats.push(m.latency);
  });
  const avgLat = lats.length
    ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)
    : null;
  const nowMs = Date.now();
  const buckets = new Array(30).fill(0);
  messages.forEach((m) => {
    const age = Math.floor((nowMs - m.ts) / 1000);
    if (age >= 0 && age < 30) buckets[29 - age]++;
  });
  const maxB = Math.max(1, ...buckets);
  const rate = (buckets.slice(-5).reduce((a, b) => a + b, 0) / 5).toFixed(1);

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
            <span style={{ color: "#58a6ff" }}>{inC}</span>
            <span style={{ color: "#3f4754" }}> / </span>
            <span style={{ color: "var(--accent,#2dd4a7)" }}>{outC}</span>
          </div>
        </div>
        <div style={card}>
          <div style={capLabel}>Avg latency</div>
          <div style={{ ...bigNum, color: "#eef2f7" }}>{avgLat != null ? avgLat + " ms" : "—"}</div>
        </div>
        <div style={card}>
          <div style={capLabel}>Errors</div>
          <div style={{ ...bigNum, color: "#ff7b72" }}>{errC}</div>
        </div>
        <div style={card}>
          <div style={capLabel}>Bytes in / out</div>
          <div style={{ font: "700 17px " + MONO, color: "#c4ccd8", marginTop: "8px" }}>
            {util.formatBytes(bIn)} <span style={{ color: "#3f4754" }}>/</span>{" "}
            {util.formatBytes(bOut)}
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
          {buckets.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: "2px 2px 0 0",
                background: v > 0 ? "var(--accent,#2dd4a7)" : "#161d27",
                height: Math.max(2, (v / maxB) * 100) + "%",
                transition: "height .25s",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Results({ state: S, ...p }: Props) {
  const ft = (S.filterText || "").toLowerCase();
  const filtered = S.messages.filter(
    (m) =>
      (S.filterDir === "all" || m.dir === S.filterDir) &&
      (!ft ||
        m.raw.toLowerCase().indexOf(ft) > -1 ||
        (m.label || "").toLowerCase().indexOf(ft) > -1),
  );

  const rawDump =
    S.messages
      .slice()
      .reverse()
      .map((m) => {
        const dm = dirMeta[m.dir] || dirMeta.sys;
        const tag = m.kind === "err" ? "ERR" : dm.l;
        return (
          "[" +
          fmtTime(m.ts) +
          "] " +
          tag +
          (tag.length < 3 ? " " : "") +
          " " +
          (m.label ? "(" + m.label + ") " : "") +
          "· " +
          util.formatBytes(m.size) +
          "\n" +
          m.raw
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
          {RESULT_TABS.map((t) => (
            <button key={t.k} onClick={() => p.onTab(t.k)} style={seg(S.resultTab === t.k)}>
              {t.l}
            </button>
          ))}
        </div>
        <span style={{ font: "11.5px " + MONO, color: "#59616f" }}>
          {filtered.length}/{S.messages.length}
        </span>
        <div style={{ flex: 1 }} />
        <input
          value={S.filterText}
          onChange={p.onFilter}
          placeholder="filter…"
          spellCheck={false}
          className="sb-input"
          style={{ width: "160px", background: "#0c0f15", border: "1px solid #1c232f", borderRadius: "7px", padding: "6px 11px", color: "#dce1ea", font: "12px " + MONO, outline: "none" }}
        />
        <div style={{ display: "flex", gap: "4px" }}>
          {FILTER_DIRS.map((d) => (
            <button key={d.k} onClick={() => p.onFilterDir(d.k)} style={pill(S.filterDir === d.k)}>
              {d.l}
            </button>
          ))}
        </div>
        <button
          onClick={p.onClear}
          className="sb-danger"
          style={{ background: "transparent", border: "1px solid #1e2632", borderRadius: "7px", padding: "6px 12px", color: "#8a93a4", font: "600 11.5px 'IBM Plex Sans'", cursor: "pointer" }}
        >
          Clear
        </button>
      </div>

      {S.subscriptions.length > 0 && (
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
          {S.subscriptions.map((sub) => (
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
                onClick={p.onCancelSub(sub)}
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
        {S.resultTab === "messages" &&
          (S.messages.length === 0 ? (
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
                  onClick={p.onFillSample}
                  className="sb-sample"
                  style={{ background: "#11161e", border: "1px solid #232c39", borderRadius: "8px", padding: "9px 15px", color: "#c4ccd8", font: "13px " + MONO, cursor: "pointer" }}
                >
                  Try wss://ws.postman-echo.com/raw
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px", padding: "14px 16px" }}>
              {filtered.map((m) => (
                <MessageCard key={m.id} m={m} />
              ))}
            </div>
          ))}

        {S.resultTab === "raw" && (
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

        {S.resultTab === "metrics" && <Metrics messages={S.messages} />}
      </div>
    </div>
  );
}
