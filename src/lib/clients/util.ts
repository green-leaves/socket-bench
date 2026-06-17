/* clients/util.ts — primitives shared across protocol clients. */
export const enc = new TextEncoder();
export const dec = new TextDecoder();

export function tryParseJSON(value: unknown): unknown {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

export function byteLen(value: unknown): number {
  return enc.encode(String(value)).length;
}

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export const util = { tryParseJSON, formatBytes, byteLen, now };
