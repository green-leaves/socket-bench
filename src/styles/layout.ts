import type { CSSProperties } from "react";
import type { Settings } from "../types";
import { FAM, tokens } from "./tokens";

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleTimeString("en-GB", { hour12: false }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

/** Top-level grid + theme CSS vars derived from settings. */
export function rootStyle(settings: Settings): CSSProperties {
  const compact = settings.density === "compact";
  return {
    height: "100vh",
    width: "100%",
    display: "grid",
    gridTemplateColumns: "266px 1fr",
    background: tokens.bg,
    color: tokens.text,
    fontFamily: FAM,
    fontSize: "var(--fs,12.5px)",
    overflow: "hidden",
    ["--accent" as never]: settings.accent,
    ["--pad-y" as never]: compact ? "6px" : "9px",
    ["--fs" as never]: compact ? "12px" : "12.5px",
    ["--gap" as never]: "12px",
  };
}

export const dividerStyle: CSSProperties = {
  flex: "none",
  width: "7px",
  cursor: "col-resize",
  background: tokens.panel,
  borderLeft: "1px solid " + tokens.border,
  borderRight: "1px solid " + tokens.border,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const dividerHandleStyle: CSSProperties = {
  height: "38px",
  width: "3px",
  borderRadius: "3px",
  background: tokens.borderSoft,
};
