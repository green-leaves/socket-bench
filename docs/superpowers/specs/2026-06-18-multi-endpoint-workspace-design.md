# SocketBench Multi-Endpoint Workspace — Design

**Date:** 2026-06-18
**Branch:** feature/multi-endpoint-workspace
**Status:** Approved

## Problem

SocketBench is currently a single-workspace tool: one global connection, one message log, one set of form fields. There is a "Collections" sidebar of saved connection presets and a separate "History" tab, but only one connection and one log exist at a time. Users want to work with multiple endpoints the way Postman/Insomnia do: a left-hand list of endpoints they have created, each with its own independent connection, log, and request/response state, all running concurrently.

## Goals

- Turn the workspace into a **per-endpoint** model. Each endpoint owns its config (protocol, URL, payloads, headers) and its own live runtime (connection status, latency, message log, subscriptions).
- Left sidebar is the **Endpoints list**, replacing both Collections and the History tab. Each row shows a **live status indicator**.
- Connections run **independently in the background** — switching endpoints does not drop other connections; they keep logging.
- **Empty state**: with zero endpoints, show a blank canvas with a centered "Create your first endpoint" button.
- Behavior mirrors a REST/socket testing tool (Postman/Insomnia).

## Non-goals

- No browser-style **tabs** — single active view; the sidebar is the navigation. (Confirmed.)
- No per-endpoint message-log **persistence** — logs and live connections are session-only.
- No change to the protocol clients themselves (`lib/clients/**`), the CodeMirror `JsonEditor`, or the theme.
- No request folders/grouping, no import/export, no environment variables (Postman-style) — out of scope.

## Decisions (from brainstorming)

- Endpoints **replace** Collections and the History tab.
- Each endpoint keeps a **background connection**; the sidebar shows a per-endpoint **status dot** (idle/connecting/open/error + a pulse when actively streaming, i.e. it has open subscriptions).
- **Persistence:** endpoint *config* persists across reload; *runtime* (status, latency, messages, subscriptions, live sockets) resets on reload.
- **Create:** a blank untitled endpoint (default protocol WebSocket, empty URL), selected immediately, configured inline; auto-labeled from the URL until renamed.
- **Single active view** (no tabs).
- **Delete requires confirmation** and closes that endpoint's socket.
- **Migration:** on first load of this version, existing saved `sktool.collections` are converted once into endpoints so nothing is lost.
- Accent/density **settings stay global**.

## Architecture

### Data model — `src/state/appState.ts`

```ts
interface Endpoint {
  id: string;
  name: string;            // user label; "" => derive from URL for display
  // --- config (persisted) ---
  protocol: Protocol;
  url: string;
  wsPayload: string;
  wsProtocols: string;
  stompSubDest: string;
  stompSendDest: string;
  stompBody: string;
  stompConnectHeaders: HeaderRow[];
  stompSendHeaders: HeaderRow[];
  rsModel: RsModel;
  rsRoute: string;
  rsData: string;
  rsInitialN: string;
  // --- runtime (NOT persisted; reset on load) ---
  status: Status;
  statusText: string;
  latency: number | null;
  messages: Message[];
  subscriptions: Subscription[];
  resultTab: "messages" | "raw" | "metrics"; // per-endpoint results view
  filterText: string;                         // per-endpoint log filter
  filterDir: "all" | "in" | "out" | "sys";    // per-endpoint log filter
}

interface AppState {
  endpoints: Endpoint[];
  activeEndpointId: string | null;
  splitW: number;       // global composer/results divider position (layout)
  settings: Settings;
}
```

**View-state placement:** `resultTab` / `filterText` / `filterDir` move onto the endpoint as runtime (each endpoint remembers its own results tab and filter; reset to defaults `"messages"` / `""` / `"all"` on reload). `splitW` (divider drag position) stays **global** on `AppState` and is persisted with settings-like behavior. The old `sidebarTab` field is **removed** (the sidebar no longer has Collections/History tabs).

- `ENDPOINT_CONFIG_KEYS: (keyof Endpoint)[]` — the persisted config fields (`id`, `name`, and the config block above; excludes runtime). This is the per-endpoint analogue of the old `FORM_KEYS`.
- `DEFAULT_ENDPOINT(id: string): Endpoint` — factory seeding the same field defaults the old `DEFAULT_STATE` used (e.g. `wsPayload: '{\n  "hello": "world"\n}'`, `rsModel: "stream"`, etc.) with reset runtime (`status:"idle"`, `statusText:"Not connected"`, `latency:null`, `messages:[]`, `subscriptions:[]`).
- `newEndpointId(): string` — `"e" + Date.now()` style unique id (same pattern as existing collection/history ids).
- Display name helper: if `name` is non-empty use it; else derive via the existing `leaf()` logic from the URL (or "Untitled" when URL is blank).

### State helpers — `src/state/useAppState.ts`

Keep `state`, `setState`, `patch` (for global keys: `activeEndpointId`, `settings`), and the live `stateRef` snapshot (`stateRef.current = state` each render — preserved).

Add:
- `updateEndpoint(id, fn: (e: Endpoint) => Endpoint)` — replace one endpoint immutably.
- `patchEndpoint(id, partial: Partial<Endpoint>)` — shallow-merge into one endpoint.

These keep per-endpoint writes in one place and avoid every hook re-implementing the `endpoints.map(...)` update.

### Connection manager — `src/hooks/useConnections.ts` (replaces `useSocketConnection`)

Manages N concurrent sockets keyed by endpoint id:
- Refs are maps: `clientsRef: Map<string, AnyClient>`, `sendTimesRef: Map<string, Record<number, number>>`, `activeChannelRef: Map<string, number | null>`.
- Every operation takes an endpoint id and reads that endpoint from `stateRef.current.endpoints`:
  `connect(id)`, `disconnect(id, silent?)`, `ready(id)`, `wsSend(id)`, `stompSubscribe(id)`, `stompSend(id)`, `rsRequest(id)`, `rsChannelPush(id)`, `rsChannelComplete(id)`, `cancelSub(id, sub)`, `removeSub(id, key)`, `closeAll()` (for unmount).
- Socket callbacks write to that endpoint's slice via `patchEndpoint`/`updateEndpoint` and the per-endpoint message log — never a global slice.
- `createClient` (`lib/clientFactory.ts`) is reused as-is; the handlers it receives (`onStatus`, `addMsg`, `err`) are closures bound to the specific endpoint id.
- The `addSubscription` DRY helper is preserved, scoped per endpoint.

### Per-endpoint message log — `src/hooks/useMessageLog.ts` (refactor)

- `addMsg(id, entry: AddMsg)` builds the `Message` (same fields, `util.tryParseJSON`, cap `.slice(0,1000)`) and appends to `endpoints[id].messages` via `updateEndpoint`.
- `err(id, message)` → `addMsg(id, { dir:"sys", kind:"err", raw:message })`.
- `clearMessages(id)`.
- A single module-level/global incrementing id ref is fine (message ids only need uniqueness within a log).

### Components

- **`EndpointList`** (replaces `Sidebar.tsx`): header with app title + `+` create button; list of endpoint rows. Each row: protocol `badge`, display name, and a **status dot** — color via `statusColors[endpoint.status]`, with the `sb-pulse` animation when `status === "connecting"` or `endpoint.subscriptions.length > 0` (actively streaming). Active row highlighted (reuse the existing `.sb-row`/sideActive styling). Interactions: click → select; double-click name → inline rename (`<input>`, commit on Enter/blur, Esc cancels); `×` on hover → `window.confirm("Delete endpoint \"<name>\"? This closes its connection.")` then delete (closing its socket via the manager). Empty list handled at the App level (EmptyState), so the list renders nothing special when empty.
- **`EmptyState`** (new): full-area centered card with a short prompt and a "Create your first endpoint" button. Shown only when `endpoints.length === 0`.
- **`ConnectionBar` / `Composer` / `Results`** (modify): receive the **active endpoint** (not the whole `AppState`) plus handlers already bound to `activeEndpointId`. Their internals are otherwise unchanged — they already render from a single state object's fields; that object becomes the active endpoint. The `Results` memoization (`MessageCard`/`Metrics`) stays.
- **Workspace keying:** the right-pane workspace is rendered with `key={activeEndpointId}` so the CodeMirror editors remount cleanly when switching endpoints (no stale editor doc).

### App composition — `src/App.tsx`

```
const { state, setState, patch, stateRef, updateEndpoint, patchEndpoint } = useAppState();
const active = state.endpoints.find(e => e.id === state.activeEndpointId) ?? null;
const conn = useConnections({ patch, setState, stateRef, updateEndpoint, patchEndpoint, addMsg, err, saveEndpoints });
... endpoint CRUD: createEndpoint(), selectEndpoint(id), renameEndpoint(id,name), deleteEndpoint(id) ...

<div grid>
  <EndpointList endpoints, activeId, status, onCreate, onSelect, onRename, onDelete />
  {active
    ? <main key={active.id}> <ConnectionBar .../> <Composer .../> <Results .../> </main>
    : <EmptyState onCreate={createEndpoint} />}
</div>
```
- `createEndpoint()` pushes `DEFAULT_ENDPOINT(newEndpointId())`, sets it active.
- `deleteEndpoint(id)` confirms, closes the socket (`conn.disconnect(id, true)`), removes it, and re-points `activeEndpointId` (to a neighbor or null).
- Field setters (`setField`, `setFieldValue`, header editors) now write to the active endpoint via `patchEndpoint(active.id, …)` / `updateEndpoint`.

### Persistence & migration — `src/lib/storage.ts` + `src/hooks/usePersistence.ts`

- `KEYS`: `endpoints: "sktool.endpoints"`, `activeEndpoint: "sktool.activeEndpoint"`, `settings: "sktool.settings"`. (Legacy `collections`/`history`/`form` keys are no longer written; `collections` is still read once for migration.)
- `loadInitialState()`:
  1. Read `sktool.endpoints` (array of config objects). If present, rehydrate each into a full `Endpoint` (config from storage + fresh runtime defaults).
  2. If absent, attempt migration: read legacy `sktool.collections`; for each, build an `Endpoint` from `DEFAULT_ENDPOINT(id)` overridden with `name`, `protocol`, `url`, and `meta` (`stompDest→stompSubDest`, `rsRoute`, `rsModel`).
  3. `activeEndpointId` = stored value if it still matches an endpoint, else the first endpoint's id, else `null`.
  4. `settings` from `sktool.settings` (unchanged).
  - All-or-nothing corrupt-storage behavior is preserved by reading through the existing `readAll(KEYS)` pattern.
- `saveEndpoints()` persists only `ENDPOINT_CONFIG_KEYS` per endpoint (strip runtime) to `sktool.endpoints`, plus `activeEndpointId`. Settings persist via the existing settings effect. Runtime is never written.
- `usePersistence`: an effect saves endpoint configs when the persisted slices change (debounced/no — same shape as today's slice effects), a settings effect, and the `beforeunload` + unmount cleanup that calls `conn.closeAll()` and `saveEndpoints()`.

## Data flow

- **Create:** `createEndpoint()` → new endpoint in state, active. Workspace shows it; nothing connected yet.
- **Edit a field:** active workspace `onChange` → `patchEndpoint(active.id, { field: value })`.
- **Connect/send:** `conn.connect(active.id)` etc.; socket callbacks `patchEndpoint(id, {status,…})` / `addMsg(id,…)`. Because handlers are bound to the id, a background endpoint's traffic updates only its own slice.
- **Switch:** `selectEndpoint(id)` sets `activeEndpointId`; other sockets keep running; their dots reflect status.
- **Reload:** configs rehydrate; runtime resets; user reconnects.

## Error handling

- Connect with blank URL → per-endpoint `err(id, "Enter an endpoint URL first.")` (same messages as today, now scoped).
- Delete confirmation via `window.confirm`; cancel aborts.
- Corrupt storage → clean defaults (empty endpoints → empty state), via `readAll` all-or-nothing.
- Sending/operating on an endpoint whose socket isn't ready → existing per-op guards (`"Not connected."`, etc.), scoped to that endpoint.

## Performance

- A background endpoint receiving a message calls `updateEndpoint(id, …)`, which produces a new `AppState`. The active workspace components read only the **active** endpoint object; since a background update does not change the active endpoint's identity, the memoized `Results` leaves (`MessageCard`/`Metrics`) and the active Composer skip re-render. The `EndpointList` re-renders cheaply (status dot / pulse only).
- Each endpoint's message log is capped at 1000 (unchanged).

## Testing / verification

- No test framework; the gate is `npm run build` (`tsc -b && vite build`) passing with zero errors.
- Manual smoke (browser):
  - Fresh load (cleared storage) → empty canvas with centered create button.
  - Create two endpoints; configure different protocols/URLs; connect both; confirm each has an independent log and the sidebar dots reflect per-endpoint status (green/pulse/red).
  - Switch between them — each shows its own messages/subscriptions; background one keeps logging.
  - Rename (double-click), delete (confirm closes its socket and removes it; active selection re-points).
  - Reload → endpoints (config) restored, logs/connections cleared; reconnect works.
  - Upgrade path: with pre-existing saved Collections in storage, first load migrates them into endpoints.
  - Existing payload-editor behavior (full-height CodeMirror, smooth typing) intact within an endpoint.

## Files touched

- `src/types.ts` — (possibly) `Endpoint`-related shared types if not kept in `appState.ts`.
- `src/state/appState.ts` — new `Endpoint`/`AppState`, `DEFAULT_ENDPOINT`, `ENDPOINT_CONFIG_KEYS`, `loadInitialState` + migration.
- `src/state/useAppState.ts` — `updateEndpoint`/`patchEndpoint`.
- `src/lib/storage.ts` — `KEYS` update.
- `src/hooks/useMessageLog.ts` — per-endpoint API.
- `src/hooks/useConnections.ts` — new (replaces `useSocketConnection.ts`).
- `src/hooks/usePersistence.ts` — endpoint config persistence + `closeAll` cleanup.
- `src/hooks/useHeaderRows.ts` — operate on active endpoint.
- `src/components/EndpointList.tsx` — new (replaces `Sidebar.tsx`).
- `src/components/EmptyState.tsx` — new.
- `src/components/ConnectionBar.tsx` / `Composer.tsx` / `Results.tsx` — bind to active endpoint.
- `src/App.tsx` — endpoint CRUD + composition + empty state.
- Remove: `src/hooks/useHistory.ts`, `src/hooks/useCollections.ts`, `src/components/Sidebar.tsx`, `src/hooks/useSocketConnection.ts` (superseded).

## Risks

- **Large surface area:** touches state, every hook, every component. Mitigated by keeping `lib/clients/**`, `clientFactory`, and `JsonEditor` untouched, and by the per-endpoint helper (`updateEndpoint`) centralizing writes.
- **Multiple live sockets:** ensure every socket is closed on delete/unmount (`closeAll`) to avoid leaks.
- **Migration correctness:** one-time `collections → endpoints` mapping must not crash on malformed legacy data (guard with the all-or-nothing read).
- **Background re-render cost:** addressed by memoization + active-only reads; if a high-rate background stream still causes jank, the escalation path is to move per-endpoint message logs out of the single `AppState` into a keyed store — noted, not done now.
