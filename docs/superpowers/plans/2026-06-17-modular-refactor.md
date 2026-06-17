# SocketBench Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 733-line `App.tsx` and the 525-line `socketClients.ts` into focused, single-responsibility modules (hooks, state, lib, per-protocol clients, styles) with no behavior or visual change.

**Architecture:** State stays centralized in one `useAppState` (`useState<AppState>` + `patch` + live `sRef`). Feature logic moves into custom hooks that receive `patch`/`setS`/`sRef`/peer-handlers and return handlers. The protocol engines split into `lib/clients/` (one module per protocol; RSocket wire-codec separated from client). Styling stays inline but is split into a `styles/` folder behind a barrel so component imports are unchanged.

**Tech Stack:** React 18 + hooks, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters` on), Vite 6. No new dependencies.

## Global Constraints

- **No behavior change, no visual change.** Classes and handlers move verbatim; only file boundaries and import wiring change.
- **No new dependencies.** React + TS + Vite only.
- **Verification is the build, not unit tests.** There is no test framework in this project and adding one is out of scope (spec non-goal). Each task's gate is `npm run build` (`tsc -b && vite build`) passing with zero errors, plus the grep assertions in the task. `noUnusedLocals`/`noUnusedParameters` are on — extraction tasks must remove the old in-place code in the same task so nothing is left dangling.
- **Preserve the `sRef.current` live-snapshot pattern.** Handlers read `sRef.current`, never a captured `s`. Do not "fix" this into dependency arrays.
- **Git:** This project is not git-initialized. To use the commit steps, run `git init` once first (`git init && git add -A && git commit -m "chore: baseline before refactor"`). If you prefer not to use git, treat each task's passing build as the checkpoint and skip the commit step. Commit messages must read as human-authored — no mention of AI/Claude/generated.
- **After every file move, run** `npm run build` from `G:\.projects\sockit`.

---

### Task 1: Split protocol engines into `lib/clients/`

**Files:**
- Create: `src/lib/clients/util.ts`
- Create: `src/lib/clients/ws.ts`
- Create: `src/lib/clients/stomp.ts`
- Create: `src/lib/clients/rsocket/frames.ts`
- Create: `src/lib/clients/rsocket/client.ts`
- Create: `src/lib/clients/index.ts`
- Delete: `src/lib/socketClients.ts`
- Modify: `src/App.tsx:2-8` (import path), `src/components/Results.tsx:5` (import path)

**Interfaces:**
- Consumes: nothing (leaf modules).
- Produces (from `src/lib/clients/index.ts`): `WSClient`, `WSClientOpts`, `StompClient`, `StompClientOpts`, `RSocketClient`, `RSocketClientOpts`, `RSocketStreamHandlers`, `AnyClient`, and `util` (`{ tryParseJSON, formatBytes, byteLen, now }`). Same names/signatures as the current `socketClients.ts` exports.

- [ ] **Step 1: Create `src/lib/clients/util.ts`** — the shared primitives (current `socketClients.ts:5-33` plus the `util` object from `:523`).

```ts
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
```

- [ ] **Step 2: Create `src/lib/clients/ws.ts`** — move `WSClientOpts` + `WSClient` verbatim from `socketClients.ts:38-96`, prefixed with this import:

```ts
import { byteLen, dec } from "./util";
```
Then paste the `export interface WSClientOpts { ... }` and `export class WSClient { ... }` blocks exactly as they are in `socketClients.ts:38-96`.

- [ ] **Step 3: Create `src/lib/clients/stomp.ts`** — move the STOMP section verbatim from `socketClients.ts:101-244` (the `const NULL = String.fromCharCode(0);` line, `StompClientOpts`, and `StompClient`), prefixed with:

```ts
import { byteLen, dec } from "./util";

const NULL = String.fromCharCode(0);
```
Then paste `export interface StompClientOpts { ... }` and `export class StompClient { ... }` exactly as in `socketClients.ts:103-244`. (Do not duplicate the `NULL` const — it is the line above; remove the original `:101` copy when cutting.)

- [ ] **Step 4: Create `src/lib/clients/rsocket/frames.ts`** — the pure binary codec from `socketClients.ts:249-300`:

```ts
import { enc } from "../util";

export const FT = {
  SETUP: 0x01,
  KEEPALIVE: 0x03,
  REQUEST_RESPONSE: 0x04,
  REQUEST_FNF: 0x05,
  REQUEST_STREAM: 0x06,
  REQUEST_CHANNEL: 0x07,
  REQUEST_N: 0x08,
  CANCEL: 0x09,
  PAYLOAD: 0x0a,
  ERROR: 0x0b,
  METADATA_PUSH: 0x0c,
} as const;

export const FLAG = {
  METADATA: 0x100,
  FOLLOWS: 0x80,
  COMPLETE: 0x40,
  NEXT: 0x20,
  RESPOND: 0x80,
} as const;

export function concat(arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (let i = 0; i < arrs.length; i++) len += arrs[i].length;
  const out = new Uint8Array(len);
  let off = 0;
  for (let i = 0; i < arrs.length; i++) {
    out.set(arrs[i], off);
    off += arrs[i].length;
  }
  return out;
}

export function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

export function u24(n: number): Uint8Array {
  return new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

export function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 255, n & 255]);
}

export function header(streamId: number, type: number, flags: number): Uint8Array {
  return concat([u32(streamId), u16((type << 10) | (flags & 0x3ff))]);
}

// composite metadata with a single routing entry
export function routingMetadata(route: string): Uint8Array {
  const r = enc.encode(route);
  const tag = concat([new Uint8Array([r.length]), r]); // routing: [len][route]
  const mimeId = 0x7e; // well-known: message/x.rsocket.routing.v0
  return concat([new Uint8Array([0x80 | mimeId]), u24(tag.length), tag]);
}
```

- [ ] **Step 5: Create `src/lib/clients/rsocket/client.ts`** — move `RSocketStreamHandlers`, `RSocketClientOpts`, and `RSocketClient` verbatim from `socketClients.ts:302-521`, prefixed with:

```ts
import { enc, dec } from "../util";
import { FT, FLAG, concat, u32, u24, u16, header, routingMetadata } from "./frames";
```
Then paste `export interface RSocketStreamHandlers { ... }`, `export interface RSocketClientOpts { ... }`, and `export class RSocketClient { ... }` exactly as in `socketClients.ts:302-521`. The class body already calls `header`, `concat`, `u32`, `u24`, `u16`, `routingMetadata`, `FT`, `FLAG`, `enc`, `dec` — all now imported. `u24` is used implicitly via `routingMetadata`/`_buildRequest`; keep it in the import list because `_buildRequest` calls `u24` directly (`socketClients.ts:401`).

- [ ] **Step 6: Create `src/lib/clients/index.ts`** — the barrel:

```ts
export { WSClient, type WSClientOpts } from "./ws";
export { StompClient, type StompClientOpts } from "./stomp";
export {
  RSocketClient,
  type RSocketClientOpts,
  type RSocketStreamHandlers,
} from "./rsocket/client";
export { util, tryParseJSON, formatBytes, byteLen, now } from "./util";
import type { WSClient } from "./ws";
import type { StompClient } from "./stomp";
import type { RSocketClient } from "./rsocket/client";

export type AnyClient = WSClient | StompClient | RSocketClient;
```

- [ ] **Step 7: Delete `src/lib/socketClients.ts`.**

- [ ] **Step 8: Update the two importers.**

In `src/App.tsx` change the import source on the block at lines 2-8 from:
```ts
} from "./lib/socketClients";
```
to:
```ts
} from "./lib/clients";
```

In `src/components/Results.tsx:5` change:
```ts
import { util } from "../lib/socketClients";
```
to:
```ts
import { util } from "../lib/clients";
```

- [ ] **Step 9: Verify build and that the old file is gone.**

Run: `npm run build`
Expected: PASS, `dist/` emitted, no TS errors.

Run: `grep -rn "socketClients" src` (Grep tool, pattern `socketClients`, path `src`)
Expected: No matches.

- [ ] **Step 10: Commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: split protocol clients into per-protocol modules"
```

---

### Task 2: Split `styles.ts` into a `styles/` folder

**Files:**
- Create: `src/styles/tokens.ts`
- Create: `src/styles/controls.ts`
- Create: `src/styles/layout.ts`
- Create: `src/styles/index.ts`
- Delete: `src/styles.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `src/styles/index.ts`, all current names preserved so `../styles` / `./styles` imports keep working): `FAM`, `MONO`, `seg`, `pill`, `sideTab`, `protoColor`, `badgeTint`, `badge`, `dirMeta`, `statusColors`, `fmtTime`. New additions: `tokens` (palette object), `rootStyle(settings)`, `dividerStyle`, `dividerHandleStyle`.

- [ ] **Step 1: Create `src/styles/tokens.ts`** — fonts + the palette constants currently scattered as literals.

```ts
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
```

- [ ] **Step 2: Create `src/styles/controls.ts`** — the segmented-control / badge / status helpers (current `styles.ts:7-94`), rewritten to reference `tokens`. Behavior identical (same literal values).

```ts
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

export function protoColor(p: Protocol): string {
  return p === "ws" ? tokens.blue : p === "stomp" ? tokens.purple : tokens.yellow;
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
  in: { l: "IN", c: tokens.blue },
  out: { l: "OUT", c: tokens.accentVar },
  sys: { l: "SYS", c: tokens.purple },
};

export const statusColors: Record<Status, string> = {
  idle: tokens.textFaint,
  connecting: tokens.yellow,
  open: tokens.accentVar,
  closed: tokens.textDim,
  error: tokens.red,
};
```

- [ ] **Step 3: Create `src/styles/layout.ts`** — `fmtTime` (current `styles.ts:96-103`) plus the root/divider styles currently inline in `App.tsx`.

```ts
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
```

- [ ] **Step 4: Create `src/styles/index.ts`** — the barrel that preserves every existing import path.

```ts
export { FAM, MONO, tokens } from "./tokens";
export {
  seg,
  pill,
  sideTab,
  protoColor,
  badgeTint,
  badge,
  dirMeta,
  statusColors,
} from "./controls";
export { fmtTime, rootStyle, dividerStyle, dividerHandleStyle } from "./layout";
```

- [ ] **Step 5: Delete `src/styles.ts`.**

- [ ] **Step 6: Verify build.**

Run: `npm run build`
Expected: PASS. (Component imports of `../styles` now resolve to `src/styles/index.ts`; `App.tsx`'s `import { FAM } from "./styles"` still resolves.)

Run: Glob `src/styles.ts`
Expected: no match (file deleted); `src/styles/` folder exists.

- [ ] **Step 7: Commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: split styles into tokens/controls/layout modules"
```

---

### Task 3: Extract pure helpers (`lib/util.ts`) and storage (`lib/storage.ts`), rewire App

**Files:**
- Create: `src/lib/util.ts`
- Create: `src/lib/storage.ts`
- Modify: `src/App.tsx` (remove inline `leaf`, replace localStorage `try/catch` in `loadInitialState` and the 3 persistence effects + `saveForm`; `rowsToObj` moves out too)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/lib/util.ts`: `leaf(str: string): string`, `rowsToObj(rows: HeaderRow[]): Record<string,string>`.
  - `src/lib/storage.ts`: `KEYS = { collections, history, form, settings }` (string constants `"sktool.collections"` etc.), `read<T>(key: string): T | null`, `write(key: string, value: unknown): void`.

- [ ] **Step 1: Create `src/lib/util.ts`.**

```ts
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
```

- [ ] **Step 2: Create `src/lib/storage.ts`.**

```ts
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
```

- [ ] **Step 3: Rewire `App.tsx` to use them.** (Full extraction of `loadInitialState`/`leaf`/`rowsToObj` into the new modules happens in Task 4 for `loadInitialState`; here, just route the helpers.) Remove the inline `leaf` definition (`App.tsx:115-120`) and the inline `rowsToObj` (`App.tsx:277-283`), and add to the imports near the top of `App.tsx`:

```ts
import { leaf, rowsToObj } from "./lib/util";
import { KEYS, read, write } from "./lib/storage";
```

Replace `loadInitialState` (`App.tsx:98-113`) body to use `read`:

```ts
function loadInitialState(): AppState {
  const s: AppState = { ...DEFAULT_STATE };
  const c = read<Collection[]>(KEYS.collections);
  const h = read<HistoryItem[]>(KEYS.history);
  const f = read<Partial<AppState>>(KEYS.form);
  const set = read<Partial<Settings>>(KEYS.settings);
  if (Array.isArray(c)) s.collections = c;
  if (Array.isArray(h)) s.history = h;
  if (f && typeof f === "object") Object.assign(s, f);
  if (set && typeof set === "object") s.settings = { ...s.settings, ...set };
  return s;
}
```

Replace the three persistence effects (`App.tsx:143-163`) with:

```ts
  useEffect(() => write(KEYS.collections, s.collections), [s.collections]);
  useEffect(() => write(KEYS.history, s.history), [s.history]);
  useEffect(() => write(KEYS.settings, s.settings), [s.settings]);
```

Replace `saveForm` (`App.tsx:165-174`) with:

```ts
  const saveForm = useCallback(() => {
    const cur = sRef.current;
    const form: Record<string, unknown> = {};
    FORM_KEYS.forEach((k) => (form[k] = cur[k]));
    write(KEYS.form, form);
  }, []);
```

- [ ] **Step 4: Verify build.**

Run: `npm run build`
Expected: PASS, no unused-symbol errors.

Run: Grep pattern `localStorage` path `src/App.tsx`
Expected: No matches (all localStorage access now in `lib/storage.ts`).

- [ ] **Step 5: Commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: extract pure helpers and storage layer"
```

---

### Task 4: Extract app state (`state/appState.ts`, `state/useAppState.ts`), rewire App

**Files:**
- Create: `src/state/appState.ts`
- Create: `src/state/useAppState.ts`
- Modify: `src/App.tsx` (remove the moved declarations; use `useAppState`)

**Interfaces:**
- Consumes: `lib/storage.ts` (`KEYS`, `read`), types from `../types`.
- Produces:
  - `appState.ts`: `interface AppState`, `DEFAULT_STATE: AppState`, `FORM_KEYS: (keyof AppState)[]`, `loadInitialState(): AppState`.
  - `useAppState.ts`: `useAppState(): { s: AppState; setS: Dispatch<SetStateAction<AppState>>; patch: (p) => void; sRef: MutableRefObject<AppState> }` where `patch` accepts `Partial<AppState> | ((prev: AppState) => Partial<AppState>)`.

- [ ] **Step 1: Create `src/state/appState.ts`** — move `AppState` (`App.tsx:26-53`), `DEFAULT_STATE` (`App.tsx:55-82`), `FORM_KEYS` (`App.tsx:84-96`), and the (now storage-based) `loadInitialState` (from Task 3) verbatim. Header:

```ts
import type {
  Collection,
  HeaderRow,
  HistoryItem,
  Message,
  Protocol,
  RsModel,
  Settings,
  Status,
  Subscription,
} from "../types";
import { KEYS, read } from "../lib/storage";
```
Then paste `export interface AppState { ... }`, `export const DEFAULT_STATE: AppState = { ... }`, `export const FORM_KEYS: (keyof AppState)[] = [ ... ]`, and `export function loadInitialState(): AppState { ... }` exactly as they now stand in `App.tsx`. Note `DEFAULT_STATE.settings` stays `{ accent: "#d4662b", density: "comfortable" }`.

- [ ] **Step 2: Create `src/state/useAppState.ts`.**

```ts
import { useCallback, useRef, useState } from "react";
import { type AppState, loadInitialState } from "./appState";

export function useAppState() {
  const [s, setS] = useState<AppState>(loadInitialState);

  const patch = useCallback(
    (p: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) =>
      setS((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) })),
    [],
  );

  // live snapshot for socket-event closures + saveForm
  const sRef = useRef(s);
  sRef.current = s;

  return { s, setS, patch, sRef };
}
```

- [ ] **Step 3: Rewire `App.tsx`.** Delete the moved blocks (`AppState` interface, `DEFAULT_STATE`, `FORM_KEYS`, `loadInitialState`, and the inline `useState`/`patch`/`sRef` at `App.tsx:123-140`). Add imports:

```ts
import { useAppState } from "./state/useAppState";
import { type AppState, FORM_KEYS } from "./state/appState";
```
(Keep `FORM_KEYS` import only as long as `saveForm` lives in App; it moves out in Task 7.) At the top of `App()`:

```ts
  const { s, setS, patch, sRef } = useAppState();
```
Remove the now-unused `useState` import if nothing else uses it (keep `useCallback`, `useEffect`, `useRef`, `type CSSProperties`). Keep the `import type { ... Collection, HistoryItem, Settings ... }` only for symbols still referenced in App; drop any that are no longer used (build will flag them).

- [ ] **Step 4: Verify build.**

Run: `npm run build`
Expected: PASS. Resolve any `noUnusedLocals` errors by trimming dead imports in `App.tsx`.

- [ ] **Step 5: Commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: extract AppState and useAppState hook"
```

---

### Task 5: Extract `useMessageLog` and `useHistory`, rewire App

**Files:**
- Create: `src/hooks/useMessageLog.ts`
- Create: `src/hooks/useHistory.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAppState` outputs (`setS`, `sRef`), `clients/util` (`util`), types.
- Produces:
  - `useMessageLog(setS)` → `{ midRef: MutableRefObject<number>; addMsg(m: AddMsg): void; err(txt: string): void; clearMessages(): void }`. Also exports the shared `AddMsg` type (`{ dir?; kind?; raw?: unknown; label?; size?; latency? }`) — reused by `clientFactory` and `useSocketConnection` so the `addMsg` signature is identical everywhere.
  - `useHistory(setS, sRef)` → `{ pushHistory(action: string): void; loadHistory(h): () => void; clearHistory(): void }`.

- [ ] **Step 1: Create `src/hooks/useMessageLog.ts`** — move `addMsg` (`App.tsx:211-237`), `err` (`:239-242`), `clearMessages` (`:243`) and `midRef` (`:131`).

```ts
import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { util } from "../lib/clients";
import type { AppState } from "../state/appState";
import type { Message } from "../types";

export type AddMsg = {
  dir?: Message["dir"];
  kind?: Message["kind"];
  raw?: unknown;
  label?: string;
  size?: number;
  latency?: number | null;
};

export function useMessageLog(setS: Dispatch<SetStateAction<AppState>>) {
  const midRef = useRef(0);

  const addMsg = useCallback(
    (m: AddMsg) => {
      const raw = m.raw == null ? "" : String(m.raw);
      const parsed = util.tryParseJSON(raw);
      const msg: Message = {
        id: ++midRef.current,
        dir: m.dir || "sys",
        kind: m.kind || (m.dir === "in" || m.dir === "out" ? "msg" : "sys"),
        ts: Date.now(),
        label: m.label || "",
        size: m.size != null ? m.size : util.byteLen(raw),
        raw,
        pretty: parsed ? JSON.stringify(parsed, null, 2) : raw,
        isJson: !!parsed,
        latency: m.latency,
      };
      setS((prev) => ({ ...prev, messages: [msg, ...prev.messages].slice(0, 1000) }));
    },
    [setS],
  );

  const err = useCallback(
    (txt: string) => addMsg({ dir: "sys", kind: "err", raw: txt }),
    [addMsg],
  );

  const clearMessages = useCallback(
    () => setS((prev) => ({ ...prev, messages: [] })),
    [setS],
  );

  return { midRef, addMsg, err, clearMessages };
}
```

- [ ] **Step 2: Create `src/hooks/useHistory.ts`** — move `pushHistory` (`App.tsx:305-318`), `loadHistory` (`:614-615`), `clearHistory` (`:616`).

```ts
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AppState } from "../state/appState";
import type { HistoryItem } from "../types";

export function useHistory(
  setS: Dispatch<SetStateAction<AppState>>,
  sRef: MutableRefObject<AppState>,
) {
  const pushHistory = useCallback(
    (action: string) => {
      const cur = sRef.current;
      const item: HistoryItem = {
        id: "h" + Date.now() + Math.random().toString(36).slice(2, 5),
        protocol: cur.protocol,
        url: cur.url,
        action,
        ts: Date.now(),
      };
      setS((prev) => ({ ...prev, history: [item, ...prev.history].slice(0, 40) }));
    },
    [setS, sRef],
  );

  const loadHistory = useCallback(
    (h: HistoryItem) => () =>
      setS((prev) => ({ ...prev, protocol: h.protocol, url: h.url })),
    [setS],
  );

  const clearHistory = useCallback(
    () => setS((prev) => ({ ...prev, history: [] })),
    [setS],
  );

  return { pushHistory, loadHistory, clearHistory };
}
```

- [ ] **Step 3: Rewire `App.tsx`.** Delete the moved blocks (`midRef`, `addMsg`, `err`, `clearMessages`, `pushHistory`, `loadHistory`, `clearHistory`). Add imports and calls:

```ts
import { useMessageLog } from "./hooks/useMessageLog";
import { useHistory } from "./hooks/useHistory";
```
Inside `App()` after `useAppState`:
```ts
  const { addMsg, err, clearMessages } = useMessageLog(setS);
  const { pushHistory, loadHistory, clearHistory } = useHistory(setS, sRef);
```
(`midRef` is now internal to `useMessageLog`; remove the App-level `midRef` ref. `loadHistory` previously used `patch`; the hook uses `setS` equivalently — same result.)

- [ ] **Step 4: Verify build.**

Run: `npm run build`
Expected: PASS. Trim any dead imports flagged.

- [ ] **Step 5: Commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: extract message log and history hooks"
```

---

### Task 6: Extract connection engine (`lib/clientFactory.ts`, `hooks/useSocketConnection.ts`), rewire App

**Files:**
- Create: `src/lib/clientFactory.ts`
- Create: `src/hooks/useSocketConnection.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `clients` (all client classes + `util`), `lib/util` (`rowsToObj`), `useMessageLog` (`addMsg`, `err`), `useHistory` (`pushHistory`), `useAppState` (`patch`, `setS`, `sRef`), `saveForm` (from App for now).
- Produces:
  - `clientFactory.ts`: `createClient(state: AppState, h: ClientHandlers): AnyClient` where `ClientHandlers = { onStatus(status: Status, text: string): void; addMsg(m): void; err(msg: string): void }`.
  - `useSocketConnection(deps)` → `{ connect(): void; disconnect(silent?: boolean): void; ready(): boolean; wsSend(): void; stompSubscribe(): void; stompSend(): void; rsRequest(): void; rsChannelPush(): void; rsChannelComplete(): void; cancelSub(sub: Subscription): () => void; removeSub(key): void }`. `deps = { patch, setS, sRef, addMsg, err, pushHistory, saveForm }`.

- [ ] **Step 1: Create `src/lib/clientFactory.ts`** — collapses the three inline builders from `connect` (`App.tsx:331-395`).

```ts
import {
  WSClient,
  StompClient,
  RSocketClient,
  type AnyClient,
} from "./clients";
import { rowsToObj } from "./util";
import type { AppState } from "../state/appState";
import type { Status } from "../types";
import type { AddMsg } from "../hooks/useMessageLog";

export interface ClientHandlers {
  onStatus: (status: Status, text: string) => void;
  addMsg: (m: AddMsg) => void;
  err: (msg: string) => void;
}

export function createClient(S: AppState, h: ClientHandlers): AnyClient {
  if (S.protocol === "ws") {
    return new WSClient({
      url: S.url,
      protocols: S.wsProtocols,
      onOpen: () => {
        h.onStatus("open", "Connected");
        h.addMsg({ dir: "sys", raw: "WebSocket open · " + S.url });
      },
      onMessage: (t, fmt) => h.addMsg({ dir: "in", raw: t, label: fmt }),
      onClose: (c, r) => {
        h.onStatus("closed", "Closed" + (c ? " (" + c + ")" : ""));
        h.addMsg({ dir: "sys", raw: "Closed" + (r ? ": " + r : "") + " · code " + c });
      },
      onError: (msg) => {
        h.onStatus("error", "Error");
        h.err(msg);
      },
    });
  }
  if (S.protocol === "stomp") {
    return new StompClient({
      url: S.url,
      connectHeaders: rowsToObj(S.stompConnectHeaders),
      onConnected: (hd) => {
        h.onStatus("open", "STOMP connected");
        h.addMsg({ dir: "sys", raw: "STOMP CONNECTED" + (hd.version ? " v" + hd.version : "") });
      },
      onMessage: (b, hd) =>
        h.addMsg({ dir: "in", raw: b, label: hd.destination || hd.subscription || "" }),
      onReceipt: (hd) => h.addMsg({ dir: "sys", raw: "RECEIPT " + (hd["receipt-id"] || "") }),
      onStompError: (b, hd) => {
        h.onStatus("error", "STOMP error");
        h.err((hd.message || "ERROR") + (b ? "\n" + b : ""));
      },
      onClose: (c) => {
        h.onStatus("closed", "Closed");
        h.addMsg({ dir: "sys", raw: "Closed · code " + c });
      },
      onError: (msg) => {
        h.onStatus("error", "Error");
        h.err(msg);
      },
    });
  }
  return new RSocketClient({
    url: S.url,
    onConnected: () => {
      h.onStatus("open", "RSocket ready");
      h.addMsg({
        dir: "sys",
        raw: "RSocket connected · SETUP sent (composite-metadata / application/json)",
      });
    },
    onClose: (c) => {
      h.onStatus("closed", "Closed");
      h.addMsg({ dir: "sys", raw: "Closed · code " + c });
    },
    onError: (msg) => {
      h.onStatus("error", "Error");
      h.err(msg);
    },
  });
}
```

- [ ] **Step 2: Create `src/hooks/useSocketConnection.ts`** — move `clientRef`/`sendTimesRef`/`activeChannelRef` (`App.tsx:132-134`), `disconnect` (`:286-303`), `connect` (`:320-402`, now using `createClient`), `ready` (`:247`), `removeSub` (`:249-256`), and the send ops `wsSend`/`stompSubscribe`/`stompSend`/`rsRequest`/`rsChannelPush`/`rsChannelComplete`/`cancelSub` (`:405-564`). Introduce one `addSubscription` helper to replace the three duplicated subscription-append blocks.

```ts
import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  type AnyClient,
  WSClient,
  StompClient,
  RSocketClient,
  util,
} from "../lib/clients";
import { rowsToObj } from "../lib/util";
import { createClient } from "../lib/clientFactory";
import { type AddMsg } from "./useMessageLog";
import type { AppState } from "../state/appState";
import type { Subscription } from "../types";

interface Deps {
  patch: (p: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  setS: Dispatch<SetStateAction<AppState>>;
  sRef: MutableRefObject<AppState>;
  addMsg: (m: AddMsg) => void;
  err: (msg: string) => void;
  pushHistory: (action: string) => void;
  saveForm: () => void;
}

export function useSocketConnection(deps: Deps) {
  const { patch, setS, sRef, addMsg, err, pushHistory, saveForm } = deps;
  const clientRef = useRef<AnyClient | null>(null);
  const sendTimesRef = useRef<Record<number, number>>({});
  const activeChannelRef = useRef<number | null>(null);

  const ready = useCallback(
    () => !!clientRef.current && clientRef.current.ready(),
    [],
  );

  const removeSub = useCallback(
    (key: string | number) =>
      setS((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.filter((x) => x.key !== key),
      })),
    [setS],
  );

  const addSubscription = useCallback(
    (sub: Subscription) =>
      setS((prev) => ({ ...prev, subscriptions: prev.subscriptions.concat([sub]) })),
    [setS],
  );

  const disconnect = useCallback(
    (silent?: boolean) => {
      if (clientRef.current) {
        try {
          clientRef.current.close();
        } catch {
          /* ignore */
        }
        clientRef.current = null;
      }
      activeChannelRef.current = null;
      if (silent !== true) {
        patch({ status: "closed", statusText: "Disconnected", subscriptions: [] });
        addMsg({ dir: "sys", raw: "Disconnected by user" });
      }
    },
    [addMsg, patch],
  );

  const connect = useCallback(() => {
    const S = sRef.current;
    if (!S.url.trim()) {
      err("Enter an endpoint URL first.");
      return;
    }
    disconnect(true);
    patch({ status: "connecting", statusText: "Connecting…", latency: null, subscriptions: [] });
    pushHistory("connect");
    saveForm();
    clientRef.current = createClient(S, {
      onStatus: (status, text) => patch({ status, statusText: text }),
      addMsg,
      err,
    });
    try {
      clientRef.current.connect();
    } catch (e) {
      patch({ status: "error", statusText: "Error" });
      err((e as Error).message);
    }
  }, [addMsg, disconnect, err, patch, pushHistory, saveForm, sRef]);

  const wsSend = useCallback(() => {
    if (!ready()) {
      err("Not connected.");
      return;
    }
    try {
      const n = (clientRef.current as WSClient).send(sRef.current.wsPayload);
      addMsg({ dir: "out", raw: sRef.current.wsPayload, size: n });
      pushHistory("send");
    } catch (e) {
      err((e as Error).message);
    }
  }, [addMsg, err, pushHistory, ready, sRef]);

  const stompSubscribe = useCallback(() => {
    if (!ready()) {
      err("Connect first (STOMP needs a CONNECTED frame).");
      return;
    }
    const dest = sRef.current.stompSubDest.trim();
    if (!dest) return;
    const id = (clientRef.current as StompClient).subscribe(dest);
    addSubscription({ key: id, kind: "stomp", label: dest });
    addMsg({ dir: "out", raw: "SUBSCRIBE " + dest, label: dest });
  }, [addMsg, addSubscription, err, ready, sRef]);

  const stompSend = useCallback(() => {
    if (!ready()) {
      err("Connect first.");
      return;
    }
    const cur = sRef.current;
    const dest = cur.stompSendDest.trim();
    const n = (clientRef.current as StompClient).send(
      dest,
      cur.stompBody,
      rowsToObj(cur.stompSendHeaders),
    );
    addMsg({ dir: "out", raw: cur.stompBody, label: dest, size: n });
    pushHistory("send");
  }, [addMsg, err, pushHistory, ready, sRef]);

  const rsRequest = useCallback(() => {
    if (!ready()) {
      err("Connect first (sends SETUP).");
      return;
    }
    const S = sRef.current;
    const client = clientRef.current as RSocketClient;
    const route = S.rsRoute.trim();
    const data = S.rsData;
    const initN = parseInt(S.rsInitialN, 10) || 2147483647;
    if (S.rsModel === "rr") {
      const r = client.requestResponse(route, data, {
        onPayload: (d) => {
          const t0 = sendTimesRef.current[r.streamId];
          const lat = t0 != null ? Math.round(util.now() - t0) : null;
          addMsg({ dir: "in", raw: d, label: route, latency: lat });
          if (lat != null) patch({ latency: lat });
        },
        onError: (c, m) => err("RSocket error " + c + ": " + m),
      });
      sendTimesRef.current[r.streamId] = util.now();
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-response", size: r.bytes });
    } else if (S.rsModel === "stream") {
      const r2 = client.requestStream(route, data, initN, {
        onPayload: (d) => addMsg({ dir: "in", raw: d, label: route }),
        onComplete: () => {
          removeSub(r2.streamId);
          addMsg({ dir: "sys", raw: "Stream complete · " + route });
        },
        onError: (c, m) => {
          removeSub(r2.streamId);
          err("RSocket error " + c + ": " + m);
        },
      });
      addSubscription({ key: r2.streamId, kind: "rsocket", label: route + " · stream" });
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-stream", size: r2.bytes });
    } else if (S.rsModel === "channel") {
      const r3 = client.requestChannel(route, data, initN, {
        onPayload: (d) => addMsg({ dir: "in", raw: d, label: route }),
        onComplete: () => {
          removeSub(r3.streamId);
          activeChannelRef.current = null;
          addMsg({ dir: "sys", raw: "Channel complete · " + route });
        },
        onError: (c, m) => {
          removeSub(r3.streamId);
          err("RSocket error " + c + ": " + m);
        },
      });
      activeChannelRef.current = r3.streamId;
      addSubscription({ key: r3.streamId, kind: "rsocket", label: route + " · channel" });
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-channel (open)", size: r3.bytes });
    } else {
      const r4 = client.fireAndForget(route, data);
      addMsg({ dir: "out", raw: data, label: route + "  ·  fire-and-forget", size: r4.bytes });
    }
    pushHistory("send");
  }, [addMsg, addSubscription, err, patch, pushHistory, ready, removeSub, sRef]);

  const rsChannelPush = useCallback(() => {
    if (activeChannelRef.current == null) {
      err("No open channel — send a request-channel first.");
      return;
    }
    const n = (clientRef.current as RSocketClient).sendPayload(
      activeChannelRef.current,
      sRef.current.rsData,
      false,
    );
    addMsg({ dir: "out", raw: sRef.current.rsData, label: "channel push", size: n });
  }, [addMsg, err, sRef]);

  const rsChannelComplete = useCallback(() => {
    if (activeChannelRef.current == null) return;
    (clientRef.current as RSocketClient).sendPayload(activeChannelRef.current, "", true);
    addMsg({ dir: "sys", raw: "Channel completed by client" });
  }, [addMsg]);

  const cancelSub = useCallback(
    (sub: Subscription) => () => {
      const client = clientRef.current;
      if (client) {
        if (sub.kind === "stomp") {
          try {
            (client as StompClient).unsubscribe(sub.key as string);
          } catch {
            /* ignore */
          }
        } else {
          try {
            (client as RSocketClient).cancel(sub.key as number);
          } catch {
            /* ignore */
          }
        }
      }
      if (sub.kind === "rsocket" && sub.key === activeChannelRef.current)
        activeChannelRef.current = null;
      removeSub(sub.key);
      addMsg({ dir: "sys", raw: "Cancelled · " + sub.label });
    },
    [addMsg, removeSub],
  );

  return {
    clientRef,
    connect,
    disconnect,
    ready,
    wsSend,
    stompSubscribe,
    stompSend,
    rsRequest,
    rsChannelPush,
    rsChannelComplete,
    cancelSub,
    removeSub,
  };
}
```

- [ ] **Step 3: Rewire `App.tsx`.** Delete all moved blocks (the three refs, `ready`, `removeSub`, `disconnect`, `pushHistory` already moved in Task 5, `connect`, and all send ops). Remove the now-unused `WSClient`/`StompClient`/`RSocketClient`/`util`/`AnyClient` imports from App if nothing else there uses them (the cleanup task confirms). Add:

```ts
import { useSocketConnection } from "./hooks/useSocketConnection";
```
Inside `App()`:
```ts
  const conn = useSocketConnection({
    patch, setS, sRef, addMsg, err, pushHistory, saveForm,
  });
```
Update JSX/handlers to reference `conn.*`: `onToggleConnect={connected || busy ? () => conn.disconnect(false) : conn.connect}`; `wsSend={conn.wsSend}`, `stompSubscribe={conn.stompSubscribe}`, `stompSend={conn.stompSend}`, `rsRequest={conn.rsRequest}`, `rsChannelPush={conn.rsChannelPush}`, `rsChannelComplete={conn.rsChannelComplete}`, `onCancelSub={conn.cancelSub}`. The cleanup-on-unmount effect (`App.tsx:177-203`) must close `conn.clientRef.current` — update its body to use `conn.clientRef`.

- [ ] **Step 4: Verify build.**

Run: `npm run build`
Expected: PASS.

Run: Grep pattern `new WSClient|new StompClient|new RSocketClient` path `src/App.tsx`
Expected: No matches (client construction now in `clientFactory`).

- [ ] **Step 5: Commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: extract socket connection hook and client factory"
```

---

### Task 7: Extract `useCollections`, `useHeaderRows`, `useSplitPane`, `usePersistence`; finalize App

**Files:**
- Create: `src/hooks/useCollections.ts`
- Create: `src/hooks/useHeaderRows.ts`
- Create: `src/hooks/useSplitPane.ts`
- Create: `src/hooks/usePersistence.ts`
- Modify: `src/App.tsx` (final slim composition + layout)

**Interfaces:**
- Produces:
  - `useCollections({ setS, sRef, patch, err })` → `{ saveCollection(): void; loadCollection(c: Collection): () => void; deleteCollection(c: Collection): (e: React.MouseEvent) => void }`.
  - `useHeaderRows(setS)` → `{ setHeader(field, i, key): (e) => void; addHeader(field): () => void; removeHeader(field, i): () => void }` where `field` is `"stompConnectHeaders" | "stompSendHeaders"`.
  - `useSplitPane(patch)` → `{ splitElRef: MutableRefObject<HTMLDivElement | null>; onDragStart(e: React.MouseEvent): void }`.
  - `usePersistence({ sRef })` → `{ saveForm(): void }` and runs the 3 slice effects + beforeunload/cleanup internally. Takes `s` slices via the `sRef`'s underlying state through explicit args (see Step 4).

- [ ] **Step 1: Create `src/hooks/useCollections.ts`** — move `defaultName` (`App.tsx:567-574`), `saveCollection` (`:575-595`), `loadCollection` (`:596-606`), `deleteCollection` (`:607-613`). Uses `leaf` from `lib/util`.

```ts
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { leaf } from "../lib/util";
import type { AppState } from "../state/appState";
import type { Collection } from "../types";

interface Deps {
  setS: Dispatch<SetStateAction<AppState>>;
  sRef: MutableRefObject<AppState>;
  patch: (p: Partial<AppState>) => void;
  err: (msg: string) => void;
}

export function useCollections({ setS, sRef, patch, err }: Deps) {
  const defaultName = useCallback(() => {
    const S = sRef.current;
    if (S.protocol === "stomp")
      return leaf(S.stompSubDest) || leaf(S.stompSendDest) || "subscription";
    if (S.protocol === "rsocket") return (S.rsRoute || "").trim() || "route";
    const l = leaf((S.url || "").replace(/^wss?:\/\//, "").split("?")[0]);
    return l || "connection";
  }, [sRef]);

  const saveCollection = useCallback(() => {
    const S = sRef.current;
    if (!S.url.trim()) {
      err("Enter a URL to save.");
      return;
    }
    const suggested = defaultName();
    const name =
      typeof window !== "undefined" && window.prompt
        ? window.prompt("Name this connection", suggested)
        : suggested;
    if (name === null) return; // cancelled
    const finalName = (name || "").trim() || suggested;
    const item: Collection = {
      id: "c" + Date.now(),
      name: finalName,
      protocol: S.protocol,
      url: S.url,
      meta: { stompDest: S.stompSubDest, rsRoute: S.rsRoute, rsModel: S.rsModel },
    };
    setS((prev) => ({ ...prev, collections: prev.collections.concat([item]) }));
  }, [defaultName, err, setS, sRef]);

  const loadCollection = useCallback(
    (c: Collection) => () => {
      const p: Partial<AppState> = { protocol: c.protocol, url: c.url };
      if (c.meta) {
        if (c.protocol === "stomp" && c.meta.stompDest) p.stompSubDest = c.meta.stompDest;
        if (c.protocol === "rsocket") {
          if (c.meta.rsRoute) p.rsRoute = c.meta.rsRoute;
          if (c.meta.rsModel) p.rsModel = c.meta.rsModel;
        }
      }
      patch(p);
    },
    [patch],
  );

  const deleteCollection = useCallback(
    (c: Collection) => (e: React.MouseEvent) => {
      if (e && e.stopPropagation) e.stopPropagation();
      setS((prev) => ({
        ...prev,
        collections: prev.collections.filter((x) => x.id !== c.id),
      }));
    },
    [setS],
  );

  return { saveCollection, loadCollection, deleteCollection };
}
```

- [ ] **Step 2: Create `src/hooks/useHeaderRows.ts`** — move `setHeader` (`App.tsx:259-268`), `addHeader` (`:269-270`), `removeHeader` (`:271-276`).

```ts
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState } from "../state/appState";

type HeaderField = "stompConnectHeaders" | "stompSendHeaders";

export function useHeaderRows(setS: Dispatch<SetStateAction<AppState>>) {
  const setHeader = useCallback(
    (field: HeaderField, i: number, key: "k" | "v") =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setS((prev) => {
          const rows = prev[field].slice();
          rows[i] = { ...rows[i], [key]: val };
          return { ...prev, [field]: rows };
        });
      },
    [setS],
  );

  const addHeader = useCallback(
    (field: HeaderField) => () =>
      setS((prev) => ({ ...prev, [field]: prev[field].concat([{ k: "", v: "" }]) })),
    [setS],
  );

  const removeHeader = useCallback(
    (field: HeaderField, i: number) => () =>
      setS((prev) => {
        const rows = prev[field].filter((_, j) => j !== i);
        return { ...prev, [field]: rows.length ? rows : [{ k: "", v: "" }] };
      }),
    [setS],
  );

  return { setHeader, addHeader, removeHeader };
}
```

- [ ] **Step 3: Create `src/hooks/useSplitPane.ts`** — move `draggingRef`/`splitElRef` (`App.tsx:135-136`), the drag effect's mousemove/mouseup portion (`:177-203`, drag parts only), and `onDragStart` (`:205-208`).

```ts
import { useCallback, useEffect, useRef } from "react";
import type { AppState } from "../state/appState";

export function useSplitPane(
  patch: (p: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void,
) {
  const splitElRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !splitElRef.current) return;
      const r = splitElRef.current.getBoundingClientRect();
      const w = e.clientX - r.left;
      patch({ splitW: Math.max(320, Math.min(r.width - 360, w)) });
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [patch]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    e.preventDefault();
  }, []);

  return { splitElRef, onDragStart };
}
```

- [ ] **Step 4: Create `src/hooks/usePersistence.ts`** — owns the 3 slice effects, `saveForm`, and the `beforeunload`/unmount cleanup that closes the client. Because cleanup must close the live client, it takes a `getClient` accessor.

```ts
import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import { KEYS, write } from "../lib/storage";
import { type AppState, FORM_KEYS } from "../state/appState";
import type { AnyClient } from "../lib/clients";
import type { Collection, HistoryItem, Settings } from "../types";

interface Deps {
  sRef: MutableRefObject<AppState>;
  collections: Collection[];
  history: HistoryItem[];
  settings: Settings;
  clientRef: MutableRefObject<AnyClient | null>;
}

export function usePersistence({ sRef, collections, history, settings, clientRef }: Deps) {
  useEffect(() => write(KEYS.collections, collections), [collections]);
  useEffect(() => write(KEYS.history, history), [history]);
  useEffect(() => write(KEYS.settings, settings), [settings]);

  const saveForm = useCallback(() => {
    const cur = sRef.current;
    const form: Record<string, unknown> = {};
    FORM_KEYS.forEach((k) => (form[k] = cur[k]));
    write(KEYS.form, form);
  }, [sRef]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveForm);
    return () => {
      saveForm();
      const c = clientRef.current;
      if (c)
        try {
          c.close();
        } catch {
          /* ignore */
        }
      window.removeEventListener("beforeunload", saveForm);
    };
  }, [saveForm, clientRef]);

  return { saveForm };
}
```

  Note the ordering dependency: `useSocketConnection` needs `saveForm`, but `usePersistence` needs `clientRef` from `useSocketConnection`. Resolve by calling `usePersistence` AFTER `useSocketConnection` and passing a stable `saveForm` into the connection hook via a ref indirection: define `saveForm` first as a standalone `useCallback` in App (the exact body above), pass it to both hooks, and have `usePersistence` accept `saveForm` as a dep instead of creating it. **Chosen resolution (matches spec):** move `saveForm` creation into App as a small `useCallback` (it only needs `sRef`), pass it into `useSocketConnection` and into `usePersistence`. Update `usePersistence` Deps to add `saveForm: () => void` and remove its internal `saveForm` definition.

  Revised `usePersistence` signature:
```ts
interface Deps {
  collections: Collection[];
  history: HistoryItem[];
  settings: Settings;
  saveForm: () => void;
  clientRef: MutableRefObject<AnyClient | null>;
}
```
  with the body keeping the 3 effects and the beforeunload effect (using the passed `saveForm`), and no `sRef` needed.

- [ ] **Step 5: Finalize `src/App.tsx`.** It should now be composition + layout only. Target content:

```tsx
import { useCallback, type CSSProperties } from "react";
import { Sidebar } from "./components/Sidebar";
import { ConnectionBar } from "./components/ConnectionBar";
import { Composer } from "./components/Composer";
import { Results } from "./components/Results";
import { useAppState } from "./state/useAppState";
import { FORM_KEYS } from "./state/appState";
import { KEYS, write } from "./lib/storage";
import { useMessageLog } from "./hooks/useMessageLog";
import { useHistory } from "./hooks/useHistory";
import { useSocketConnection } from "./hooks/useSocketConnection";
import { useCollections } from "./hooks/useCollections";
import { useHeaderRows } from "./hooks/useHeaderRows";
import { useSplitPane } from "./hooks/useSplitPane";
import { usePersistence } from "./hooks/usePersistence";
import { rootStyle, dividerStyle, dividerHandleStyle } from "./styles";
import type { AppState } from "./state/appState";

export function App() {
  const { s, setS, patch, sRef } = useAppState();

  const saveForm = useCallback(() => {
    const cur = sRef.current;
    const form: Record<string, unknown> = {};
    FORM_KEYS.forEach((k) => (form[k] = cur[k]));
    write(KEYS.form, form);
  }, [sRef]);

  const { addMsg, err, clearMessages } = useMessageLog(setS);
  const { pushHistory, loadHistory, clearHistory } = useHistory(setS, sRef);
  const conn = useSocketConnection({ patch, setS, sRef, addMsg, err, pushHistory, saveForm });
  const { saveCollection, loadCollection, deleteCollection } = useCollections({
    setS, sRef, patch, err,
  });
  const { setHeader, addHeader, removeHeader } = useHeaderRows(setS);
  const { splitElRef, onDragStart } = useSplitPane(patch);
  usePersistence({
    collections: s.collections,
    history: s.history,
    settings: s.settings,
    saveForm,
    clientRef: conn.clientRef,
  });

  const setField =
    (k: keyof AppState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patch({ [k]: e.target.value } as Partial<AppState>);

  const fillSample = () => patch({ protocol: "ws", url: "wss://ws.postman-echo.com/raw" });
  const connected = s.status === "open";
  const busy = s.status === "connecting";
  const root: CSSProperties = rootStyle(s.settings);

  return (
    <div style={root}>
      <Sidebar
        sidebarTab={s.sidebarTab}
        collections={s.collections}
        history={s.history}
        onCollTab={() => patch({ sidebarTab: "collections" })}
        onHistTab={() => patch({ sidebarTab: "history" })}
        onSave={saveCollection}
        onLoadCollection={loadCollection}
        onDeleteCollection={deleteCollection}
        onLoadHistory={loadHistory}
        onClearHistory={clearHistory}
      />

      <main style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <ConnectionBar
          protocol={s.protocol}
          url={s.url}
          status={s.status}
          statusText={s.statusText}
          latency={s.latency}
          settings={s.settings}
          connected={connected}
          busy={busy}
          onProtocol={(p) => patch({ protocol: p })}
          onUrl={setField("url")}
          onToggleConnect={connected || busy ? () => conn.disconnect(false) : conn.connect}
          onAccent={(accent) => patch({ settings: { ...s.settings, accent } })}
          onDensity={(density) => patch({ settings: { ...s.settings, density } })}
        />

        <div
          ref={splitElRef}
          style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0, minWidth: 0 }}
        >
          <Composer
            state={s}
            setField={setField}
            setHeader={setHeader}
            addHeader={addHeader}
            removeHeader={removeHeader}
            onProtoModel={(m) => patch({ rsModel: m })}
            wsSend={conn.wsSend}
            stompSubscribe={conn.stompSubscribe}
            stompSend={conn.stompSend}
            rsRequest={conn.rsRequest}
            rsChannelPush={conn.rsChannelPush}
            rsChannelComplete={conn.rsChannelComplete}
          />

          <div className="sb-divider" onMouseDown={onDragStart} style={dividerStyle}>
            <div style={dividerHandleStyle} />
          </div>

          <Results
            state={s}
            onTab={(t) => patch({ resultTab: t })}
            onFilter={setField("filterText")}
            onFilterDir={(d) => patch({ filterDir: d })}
            onClear={clearMessages}
            onCancelSub={conn.cancelSub}
            onFillSample={fillSample}
          />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Verify build + line count.**

Run: `npm run build`
Expected: PASS, no unused-symbol errors.

Run: `wc -l src/App.tsx`
Expected: roughly 110-140 lines.

- [ ] **Step 7: Commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: extract collections, header, split-pane, persistence hooks; slim App"
```

---

### Task 8: Final verification and smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full clean build.**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Structure sanity checks.**

Run: Grep pattern `socketClients` path `src` → expect no matches.
Run: Grep pattern `localStorage` path `src` → expect matches ONLY in `src/lib/storage.ts`.
Run: Glob `src/hooks/*.ts` → expect 7 files.
Run: Glob `src/styles/*.ts` → expect 4 files (index, tokens, controls, layout).
Run: Glob `src/lib/clients/**/*.ts` → expect 6 files (index, util, ws, stomp, rsocket/frames, rsocket/client).

- [ ] **Step 3: Manual smoke in `npm run dev`.** Confirm each behaves exactly as before:
  - Switch protocol WebSocket / STOMP / RSocket — selected tab solid accent, others neutral, no lingering.
  - WebSocket: connect to `wss://ws.postman-echo.com/raw`, send payload, see IN/OUT messages; disconnect.
  - STOMP: subscribe + send populate the active-subscription chip and messages.
  - RSocket: request-response / stream / channel; channel push + complete; cancel a subscription.
  - Collections: save (prompt), load, delete; History: appears on connect/send, load, clear.
  - Split-pane drag resizes composer/results within bounds.
  - Accent color swatch + Cozy/Compact density update live.
  - Reload page — form, collections, history, settings persist.

- [ ] **Step 4: Final commit** (skip if not using git)

```bash
git add -A
git commit -m "refactor: complete modularization of SocketBench"
```

---

## Notes on the saveForm ordering

`saveForm` is defined once in `App` (needs only `sRef`) and passed into both `useSocketConnection` (used by `connect`) and `usePersistence` (used by `beforeunload`). This avoids a circular dependency between the connection hook (which needs `saveForm`) and persistence (which needs the connection's `clientRef`). Hook call order in `App`: `useAppState` → define `saveForm` → `useMessageLog` → `useHistory` → `useSocketConnection` → `useCollections` → `useHeaderRows` → `useSplitPane` → `usePersistence`.
