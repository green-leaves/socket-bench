import type { CSSProperties } from "react";
import type { Protocol, Direction, Status } from "./types";

export const FAM = "'IBM Plex Sans',system-ui,sans-serif";
export const MONO = "'IBM Plex Mono',monospace";

/** Segmented-control button — used by every tab group (protocol selector,
 *  result tabs, RSocket models). Selected = solid accent; unselected reverts
 *  to a neutral transparent/gray state. */
export function seg(active: boolean): CSSProperties {
  return {
    padding: "7px 13px",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "12px",
    fontFamily: FAM,
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: "1px solid transparent",
    background: active ? "var(--accent,#2dd4a7)" : "transparent",
    color: active ? "#06120d" : "#8a93a4",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  };
}

/** Direction filter pill. */
export function pill(active: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: "5px",
    fontWeight: 600,
    fontSize: "11px",
    fontFamily: FAM,
    cursor: "pointer",
    border: active ? "1px solid transparent" : "1px solid #2a3340",
    background: active ? "var(--accent,#2dd4a7)" : "transparent",
    color: active ? "#06120d" : "#8a93a4",
  };
}

/** Sidebar tab (Collections / History). */
export function sideTab(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "7px",
    borderRadius: "7px",
    fontWeight: 600,
    fontSize: "11.5px",
    fontFamily: FAM,
    cursor: "pointer",
    border: "1px solid " + (active ? "#232c39" : "transparent"),
    background: active ? "#11161e" : "transparent",
    color: active ? "#dce1ea" : "#59616f",
  };
}

export function protoColor(p: Protocol): string {
  return p === "ws" ? "#58a6ff" : p === "stomp" ? "#a78bfa" : "#f5c451";
}
export function badgeTint(p: Protocol): string {
  return p === "ws"
    ? "rgba(88,166,255,.16)"
    : p === "stomp"
      ? "rgba(167,139,250,.16)"
      : "rgba(245,196,81,.16)";
}
export function badge(p: Protocol): CSSProperties {
  return {
    flex: "none",
    font: "700 9.5px " + MONO,
    letterSpacing: ".07em",
    padding: "4px 7px",
    borderRadius: "5px",
    color: protoColor(p),
    background: badgeTint(p),
    border: "1px solid " + protoColor(p) + "33",
  };
}

export const dirMeta: Record<Direction, { l: string; c: string }> = {
  in: { l: "IN", c: "#58a6ff" },
  out: { l: "OUT", c: "var(--accent,#2dd4a7)" },
  sys: { l: "SYS", c: "#a78bfa" },
};

export const statusColors: Record<Status, string> = {
  idle: "#59616f",
  connecting: "#f5c451",
  open: "var(--accent,#2dd4a7)",
  closed: "#8a93a4",
  error: "#ff7b72",
};

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleTimeString("en-GB", { hour12: false }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}
