import type { HeaderRow } from "../types";

/** Last non-empty path segment of a "/"-delimited string. */
export function leaf(path: string): string {
  const segments = String(path || "")
    .split("/")
    .filter(Boolean);
  return segments.length ? segments[segments.length - 1] : "";
}

/** Collapse header rows into an object, dropping blank keys. */
export function rowsToObj(rows: HeaderRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  (rows || []).forEach((row) => {
    if (row.key && row.key.trim()) result[row.key.trim()] = row.value;
  });
  return result;
}
