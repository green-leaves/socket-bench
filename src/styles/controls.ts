import type { CSSProperties } from "react";
import type { Protocol, Direction, Status } from "../types";
import { FAM, MONO, tokens } from "./tokens";

/** Segmented-control button — selected = solid accent; unselected = neutral. */
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
    background: active ? tokens.accentVar : "transparent",
    color: active ? tokens.onAccent : tokens.textDim,
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
    border: active ? "1px solid transparent" : "1px solid " + tokens.borderSoft,
    background: active ? tokens.accentVar : "transparent",
    color: active ? tokens.onAccent : tokens.textDim,
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
    border: "1px solid " + (active ? tokens.sideActiveBorder : "transparent"),
    background: active ? tokens.sideActiveBg : "transparent",
    color: active ? tokens.text : tokens.textFaint,
  };
}

export function protoColor(protocol: Protocol): string {
  return protocol === "ws" ? tokens.blue : protocol === "stomp" ? tokens.purple : tokens.yellow;
}

export function badgeTint(protocol: Protocol): string {
  return protocol === "ws"
    ? "rgba(88,166,255,.16)"
    : protocol === "stomp"
      ? "rgba(167,139,250,.16)"
      : "rgba(245,196,81,.16)";
}

export function badge(protocol: Protocol): CSSProperties {
  return {
    flex: "none",
    font: "700 9.5px " + MONO,
    letterSpacing: ".07em",
    padding: "4px 7px",
    borderRadius: "5px",
    color: protoColor(protocol),
    background: badgeTint(protocol),
    border: "1px solid " + protoColor(protocol) + "33",
  };
}

export const dirMeta: Record<Direction, { label: string; color: string }> = {
  in: { label: "IN", color: tokens.blue },
  out: { label: "OUT", color: tokens.accentVar },
  sys: { label: "SYS", color: tokens.purple },
};

export const statusColors: Record<Status, string> = {
  idle: tokens.textFaint,
  connecting: tokens.yellow,
  open: tokens.accentVar,
  closed: tokens.textDim,
  error: tokens.red,
};
