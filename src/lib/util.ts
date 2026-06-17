import type { HeaderRow } from "../types";

/** Last non-empty path segment of a "/"-delimited string. */
export function leaf(str: string): string {
  const parts = String(str || "")
    .split("/")
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** Collapse header rows into an object, dropping blank keys. */
export function rowsToObj(rows: HeaderRow[]): Record<string, string> {
  const o: Record<string, string> = {};
  (rows || []).forEach((r) => {
    if (r.k && r.k.trim()) o[r.k.trim()] = r.v;
  });
  return o;
}
