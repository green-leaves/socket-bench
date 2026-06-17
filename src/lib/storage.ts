/* storage.ts — localStorage access with the SocketBench key namespace. */
export const KEYS = {
  collections: "sktool.collections",
  history: "sktool.history",
  form: "sktool.form",
  settings: "sktool.settings",
} as const;

export function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") as T | null;
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
