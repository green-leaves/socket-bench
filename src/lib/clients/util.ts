/* clients/util.ts — primitives shared across protocol clients. */
export const enc = new TextEncoder();
export const dec = new TextDecoder();

export function tryParseJSON(s: unknown): unknown {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (t[0] !== "{" && t[0] !== "[") return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

export function byteLen(s: unknown): number {
  return enc.encode(String(s)).length;
}

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export const util = { tryParseJSON, formatBytes, byteLen, now };
