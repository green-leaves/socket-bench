/* styles/tokens.ts — design tokens (fonts, palette, spacing). */
export const FAM = "'IBM Plex Sans',system-ui,sans-serif";
export const MONO = "'IBM Plex Mono',monospace";

export const tokens = {
  bg: "#0a0c10",
  panel: "#0b0e13",
  text: "#dce1ea",
  textDim: "#8a93a4",
  textFaint: "#59616f",
  border: "#1c232f",
  borderSoft: "#2a3340",
  sideActiveBg: "#11161e",
  sideActiveBorder: "#232c39",
  onAccent: "#06120d",
  accentVar: "var(--accent,#2dd4a7)",
  blue: "#58a6ff",
  purple: "#a78bfa",
  yellow: "#f5c451",
  red: "#ff7b72",
} as const;
