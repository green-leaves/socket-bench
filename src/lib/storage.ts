/* storage.ts — localStorage access with the SocketBench key namespace. */
export const KEYS = {
  collections: "sktool.collections",
  history: "sktool.history",
  form: "sktool.form",
  settings: "sktool.settings",
  endpoints: "sktool.endpoints",
  activeEndpoint: "sktool.activeEndpoint",
} as const;

/**
 * Read and parse several namespaced keys atomically: if ANY value is corrupt
 * JSON, returns null so the caller falls back to a single clean default state
 * (rather than partially applying some keys). Missing keys parse to null.
 */
export function readAll<T extends Record<string, string>>(
  keys: T,
): Record<keyof T, unknown> | null {
  try {
    const result = {} as Record<keyof T, unknown>;
    (Object.keys(keys) as (keyof T)[]).forEach((name) => {
      result[name] = JSON.parse(localStorage.getItem(keys[name]) || "null");
    });
    return result;
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
