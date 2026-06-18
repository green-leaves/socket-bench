# Multi-Endpoint Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn SocketBench into a multi-endpoint tool — a left sidebar of endpoints (replacing Collections+History), each with its own background connection, log, and request/response state, plus an empty-state canvas.

**Architecture:** Parallel build-then-switch. Tasks 1–4 add new modules (`state/endpoint.ts`, `state/useWorkspace.ts`, `hooks/useConnections.ts`, `components/EndpointList.tsx`, `components/EmptyState.tsx`) that type-check green alongside the existing app. Task 5 flips `App.tsx` and the shared display components to the new per-endpoint model and deletes the superseded files. State stays centralized in one `WorkspaceState` ({ endpoints, activeEndpointId, splitW, settings }) with a live `stateRef` snapshot; the connection manager keys N sockets by endpoint id.

**Tech Stack:** React 18 + hooks, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters` on), Vite 6, CodeMirror 6 (unchanged).

## Global Constraints

- **Verification is the build, not unit tests.** No test framework exists; do not add one. Each task's gate is `npm run build` (`tsc -b && vite build`) passing with zero errors, run from `G:\.projects\sockit`.
- **Each task ends green.** Tasks 1–4 add new files that compile without being imported yet (tsc type-checks them; that is expected and fine). The breaking switch is confined to Task 5, which is green at its end.
- **Do not change** `src/lib/clients/**`, `src/components/JsonEditor.tsx`, or the theme palette.
- **Preserve the live-snapshot pattern**: `stateRef.current = state` every render; socket-event closures read `stateRef.current`, never a captured render value.
- **Persistence:** endpoint *config* persists (`ENDPOINT_CONFIG_KEYS`); *runtime* (status, latency, messages, subscriptions, resultTab, filterText, filterDir) is never persisted and resets on load. `splitW` is not persisted (matches today). Settings persist.
- **Behavior parity inside an endpoint:** protocol send/subscribe/cancel/channel logic, status transitions, latency via `sendTimesRef`+`util.now()`, and message shaping must match the current single-workspace behavior — only the keying-by-endpoint changes.
- **Git:** commit after each task. Commit messages must read as human-authored — no mention of AI/Claude/generated.

---

### Task 1: Endpoint model + clientFactory structural input

**Files:**
- Create: `src/state/endpoint.ts`
- Modify: `src/lib/clientFactory.ts`

**Interfaces:**
- Consumes: `Collection`, `HeaderRow`, `Message`, `Protocol`, `RsModel`, `Settings`, `Status`, `Subscription` from `../types`; `leaf` from `../lib/util`.
- Produces: `Endpoint`, `WorkspaceState`, `AddMsg`, `DEFAULT_SETTINGS`, `ENDPOINT_CONFIG_KEYS`, `newEndpointId()`, `DEFAULT_ENDPOINT(id?)`, `endpointFromCollection(c)`, `endpointDisplayName(e)`; and `ClientConfig` + an updated `createClient(config: ClientConfig, handlers)` in `clientFactory.ts`.

- [ ] **Step 1: Create `src/state/endpoint.ts`**

```ts
import type {
  Collection,
  HeaderRow,
  Message,
  Protocol,
  RsModel,
  Settings,
  Status,
  Subscription,
} from "../types";
import { leaf } from "../lib/util";

/** Shape accepted by addMsg/err handlers (shared by the connection manager). */
export type AddMsg = {
  dir?: Message["dir"];
  kind?: Message["kind"];
  raw?: unknown;
  label?: string;
  size?: number;
  latency?: number | null;
};

export interface Endpoint {
  id: string;
  name: string; // user label; "" => derive from URL for display
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
  resultTab: "messages" | "raw" | "metrics";
  filterText: string;
  filterDir: "all" | "in" | "out" | "sys";
}

export interface WorkspaceState {
  endpoints: Endpoint[];
  activeEndpointId: string | null;
  splitW: number;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { accent: "#d4662b", density: "comfortable" };

/** Config fields persisted per endpoint (excludes all runtime fields). */
export const ENDPOINT_CONFIG_KEYS: (keyof Endpoint)[] = [
  "id",
  "name",
  "protocol",
  "url",
  "wsPayload",
  "wsProtocols",
  "stompSubDest",
  "stompSendDest",
  "stompBody",
  "stompConnectHeaders",
  "stompSendHeaders",
  "rsModel",
  "rsRoute",
  "rsData",
  "rsInitialN",
];

export function newEndpointId(): string {
  return "e" + Date.now() + Math.random().toString(36).slice(2, 5);
}

export function DEFAULT_ENDPOINT(id: string = newEndpointId()): Endpoint {
  return {
    id,
    name: "",
    protocol: "ws",
    url: "",
    wsPayload: '{\n  "hello": "world"\n}',
    wsProtocols: "",
    stompSubDest: "/topic/messages",
    stompSendDest: "/app/hello",
    stompBody: '{\n  "name": "QA"\n}',
    stompConnectHeaders: [{ key: "", value: "" }],
    stompSendHeaders: [{ key: "", value: "" }],
    rsModel: "stream",
    rsRoute: "greeting",
    rsData: '{\n  "name": "QA"\n}',
    rsInitialN: "2147483647",
    status: "idle",
    statusText: "Not connected",
    latency: null,
    messages: [],
    subscriptions: [],
    resultTab: "messages",
    filterText: "",
    filterDir: "all",
  };
}

/** One-time migration: legacy saved Collection -> Endpoint. */
export function endpointFromCollection(collection: Collection): Endpoint {
  const endpoint = DEFAULT_ENDPOINT();
  endpoint.name = collection.name || "";
  endpoint.protocol = collection.protocol;
  endpoint.url = collection.url;
  if (collection.meta) {
    if (collection.meta.stompDest) endpoint.stompSubDest = collection.meta.stompDest;
    if (collection.meta.rsRoute) endpoint.rsRoute = collection.meta.rsRoute;
    if (collection.meta.rsModel) endpoint.rsModel = collection.meta.rsModel;
  }
  return endpoint;
}

/** Sidebar label: explicit name, else the URL's last path segment, else "Untitled". */
export function endpointDisplayName(endpoint: Endpoint): string {
  if (endpoint.name.trim()) return endpoint.name.trim();
  const fromUrl = leaf((endpoint.url || "").replace(/^wss?:\/\//, "").split("?")[0]);
  return fromUrl || "Untitled";
}
```

- [ ] **Step 2: Make `createClient` accept a structural config**

In `src/lib/clientFactory.ts`, replace the top imports and the function signature so it no longer depends on the old `AppState` and reads only the four fields it needs. Change the import block:
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
```
to:
```ts
import {
  WSClient,
  StompClient,
  RSocketClient,
  type AnyClient,
} from "./clients";
import { rowsToObj } from "./util";
import type { HeaderRow, Protocol, Status } from "../types";
import type { AddMsg } from "../state/endpoint";

export interface ClientConfig {
  protocol: Protocol;
  url: string;
  wsProtocols: string;
  stompConnectHeaders: HeaderRow[];
}
```
Then change the function signature line:
```ts
export function createClient(appState: AppState, handlers: ClientHandlers): AnyClient {
```
to:
```ts
export function createClient(appState: ClientConfig, handlers: ClientHandlers): AnyClient {
```
Leave the body unchanged — it already reads only `appState.protocol`, `appState.url`, `appState.wsProtocols`, `appState.stompConnectHeaders`. (Both the old `AppState` and the new `Endpoint` are structurally assignable to `ClientConfig`, so the existing `useSocketConnection` keeps compiling.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors. (`endpoint.ts` is new and unused — fine; `clientFactory` still serves the old `useSocketConnection`.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add endpoint model and structural client config"
```

---

### Task 2: Storage keys + workspace state hook

**Files:**
- Modify: `src/lib/storage.ts`
- Create: `src/state/useWorkspace.ts`

**Interfaces:**
- Consumes: `KEYS`, `readAll`, `write` from `../lib/storage`; `Endpoint`, `WorkspaceState`, `DEFAULT_ENDPOINT`, `DEFAULT_SETTINGS`, `ENDPOINT_CONFIG_KEYS`, `endpointFromCollection` from `./endpoint`; `Collection`, `Settings` from `../types`.
- Produces: `loadWorkspaceState()`, and `useWorkspace()` returning `{ state, setState, patch, stateRef, updateEndpoint, patchEndpoint }`.

- [ ] **Step 1: Add the new storage keys**

In `src/lib/storage.ts`, replace the `KEYS` object:
```ts
export const KEYS = {
  collections: "sktool.collections",
  history: "sktool.history",
  form: "sktool.form",
  settings: "sktool.settings",
} as const;
```
with (adds `endpoints`/`activeEndpoint`; keeps `collections` for one-time migration; drops the now-unused `history`/`form`):
```ts
export const KEYS = {
  collections: "sktool.collections", // legacy — read once for migration
  settings: "sktool.settings",
  endpoints: "sktool.endpoints",
  activeEndpoint: "sktool.activeEndpoint",
} as const;
```
Leave `readAll` and `write` unchanged.

(Note: the old `appState.ts` imports `KEYS.collections`/`KEYS.history`/`KEYS.form`. `KEYS.history`/`KEYS.form` no longer exist, so this step temporarily breaks the old `appState.ts` build. That is acceptable within Task 2 ONLY IF Step 2 below does not depend on it — but the build gate at Step 3 must pass. To keep Step 3 green, also do Step 1b.)

- [ ] **Step 1b: Keep the old state compiling until the switch**

The old `src/state/appState.ts` still references `KEYS.history` and `KEYS.form`. Until Task 5 deletes it, restore those two keys so the project still type-checks. Final `KEYS`:
```ts
export const KEYS = {
  collections: "sktool.collections",
  history: "sktool.history",
  form: "sktool.form",
  settings: "sktool.settings",
  endpoints: "sktool.endpoints",
  activeEndpoint: "sktool.activeEndpoint",
} as const;
```
(`history`/`form` are removed in Task 5 once `appState.ts` is gone.)

- [ ] **Step 2: Create `src/state/useWorkspace.ts`**

```ts
import { useCallback, useRef, useState } from "react";
import { KEYS, readAll } from "../lib/storage";
import {
  type Endpoint,
  type WorkspaceState,
  DEFAULT_ENDPOINT,
  DEFAULT_SETTINGS,
  ENDPOINT_CONFIG_KEYS,
  endpointFromCollection,
} from "./endpoint";
import type { Collection, Settings } from "../types";

/** Rehydrate a stored config object into a full Endpoint (fresh runtime). */
function rehydrate(config: Partial<Endpoint>): Endpoint {
  const endpoint = DEFAULT_ENDPOINT(typeof config.id === "string" ? config.id : undefined);
  const source = config as Record<string, unknown>;
  const target = endpoint as unknown as Record<string, unknown>;
  ENDPOINT_CONFIG_KEYS.forEach((key) => {
    if (source[key] !== undefined) target[key] = source[key];
  });
  return endpoint;
}

export function loadWorkspaceState(): WorkspaceState {
  const base: WorkspaceState = {
    endpoints: [],
    activeEndpointId: null,
    splitW: 480,
    settings: { ...DEFAULT_SETTINGS },
  };
  const stored = readAll(KEYS);
  if (!stored) return base;

  if (stored.settings && typeof stored.settings === "object")
    base.settings = { ...base.settings, ...(stored.settings as Partial<Settings>) };

  const storedEndpoints = stored.endpoints;
  if (Array.isArray(storedEndpoints) && storedEndpoints.length) {
    base.endpoints = storedEndpoints.map((c) => rehydrate(c as Partial<Endpoint>));
  } else {
    const legacy = stored.collections; // one-time migration
    if (Array.isArray(legacy)) base.endpoints = (legacy as Collection[]).map(endpointFromCollection);
  }

  const storedActive = stored.activeEndpoint;
  const activeId = typeof storedActive === "string" ? storedActive : null;
  base.activeEndpointId =
    base.endpoints.find((e) => e.id === activeId)?.id ?? base.endpoints[0]?.id ?? null;

  return base;
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(loadWorkspaceState);

  const patch = useCallback(
    (update: Partial<WorkspaceState>) => setState((prev) => ({ ...prev, ...update })),
    [],
  );

  const updateEndpoint = useCallback(
    (id: string, fn: (endpoint: Endpoint) => Endpoint) =>
      setState((prev) => ({
        ...prev,
        endpoints: prev.endpoints.map((e) => (e.id === id ? fn(e) : e)),
      })),
    [],
  );

  const patchEndpoint = useCallback(
    (id: string, partial: Partial<Endpoint>) =>
      updateEndpoint(id, (e) => ({ ...e, ...partial })),
    [updateEndpoint],
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  return { state, setState, patch, stateRef, updateEndpoint, patchEndpoint };
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add workspace state hook with endpoint persistence and migration"
```

---

### Task 3: Connection manager (multi-socket, per-endpoint logging)

**Files:**
- Create: `src/hooks/useConnections.ts`

**Interfaces:**
- Consumes: `AnyClient`, `WSClient`, `StompClient`, `RSocketClient`, `util` from `../lib/clients`; `rowsToObj` from `../lib/util`; `createClient` from `../lib/clientFactory`; `Endpoint`, `WorkspaceState`, `AddMsg` from `../state/endpoint`; `Message`, `Subscription` from `../types`; `updateEndpoint`/`patchEndpoint` (from `useWorkspace`) and `stateRef`/`saveEndpoints` passed as deps.
- Produces: `useConnections(deps)` returning `{ clientsRef, connect, disconnect, ready, wsSend, stompSubscribe, stompSend, rsRequest, rsChannelPush, rsChannelComplete, cancelSub, removeSub, clearMessages, closeAll }` — every op except `closeAll` takes an endpoint `id` as its first argument.

- [ ] **Step 1: Create `src/hooks/useConnections.ts`**

```ts
import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  type AnyClient,
  WSClient,
  StompClient,
  RSocketClient,
  util,
} from "../lib/clients";
import { rowsToObj } from "../lib/util";
import { createClient } from "../lib/clientFactory";
import { type AddMsg, type Endpoint, type WorkspaceState } from "../state/endpoint";
import type { Message, Subscription } from "../types";

interface Deps {
  stateRef: MutableRefObject<WorkspaceState>;
  updateEndpoint: (id: string, fn: (e: Endpoint) => Endpoint) => void;
  patchEndpoint: (id: string, partial: Partial<Endpoint>) => void;
  saveEndpoints: () => void;
}

export function useConnections(deps: Deps) {
  const { stateRef, updateEndpoint, patchEndpoint, saveEndpoints } = deps;
  const clientsRef = useRef<Map<string, AnyClient>>(new Map());
  const sendTimesRef = useRef<Map<string, Record<number, number>>>(new Map());
  const activeChannelRef = useRef<Map<string, number | null>>(new Map());

  const endpointOf = useCallback(
    (id: string) => stateRef.current.endpoints.find((e) => e.id === id),
    [stateRef],
  );

  const msgIdRef = useRef(0);
  const addMsg = useCallback(
    (id: string, entry: AddMsg) => {
      const raw = entry.raw == null ? "" : String(entry.raw);
      const parsed = util.tryParseJSON(raw);
      const message: Message = {
        id: ++msgIdRef.current,
        dir: entry.dir || "sys",
        kind: entry.kind || (entry.dir === "in" || entry.dir === "out" ? "msg" : "sys"),
        ts: Date.now(),
        label: entry.label || "",
        size: entry.size != null ? entry.size : util.byteLen(raw),
        raw,
        pretty: parsed ? JSON.stringify(parsed, null, 2) : raw,
        isJson: !!parsed,
        latency: entry.latency,
      };
      updateEndpoint(id, (e) => ({ ...e, messages: [message, ...e.messages].slice(0, 1000) }));
    },
    [updateEndpoint],
  );

  const err = useCallback(
    (id: string, message: string) => addMsg(id, { dir: "sys", kind: "err", raw: message }),
    [addMsg],
  );

  const clearMessages = useCallback(
    (id: string) => updateEndpoint(id, (e) => ({ ...e, messages: [] })),
    [updateEndpoint],
  );

  const ready = useCallback((id: string) => {
    const client = clientsRef.current.get(id);
    return !!client && client.ready();
  }, []);

  const removeSub = useCallback(
    (id: string, key: string | number) =>
      updateEndpoint(id, (e) => ({
        ...e,
        subscriptions: e.subscriptions.filter((s) => s.key !== key),
      })),
    [updateEndpoint],
  );

  const addSubscription = useCallback(
    (id: string, sub: Subscription) =>
      updateEndpoint(id, (e) => ({ ...e, subscriptions: e.subscriptions.concat([sub]) })),
    [updateEndpoint],
  );

  const disconnect = useCallback(
    (id: string, silent?: boolean) => {
      const client = clientsRef.current.get(id);
      if (client) {
        try {
          client.close();
        } catch {
          /* ignore */
        }
        clientsRef.current.delete(id);
      }
      activeChannelRef.current.set(id, null);
      if (silent !== true) {
        patchEndpoint(id, { status: "closed", statusText: "Disconnected", subscriptions: [] });
        addMsg(id, { dir: "sys", raw: "Disconnected by user" });
      }
    },
    [addMsg, patchEndpoint],
  );

  const connect = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!endpoint.url.trim()) {
        err(id, "Enter an endpoint URL first.");
        return;
      }
      disconnect(id, true);
      patchEndpoint(id, {
        status: "connecting",
        statusText: "Connecting…",
        latency: null,
        subscriptions: [],
      });
      saveEndpoints();
      const client = createClient(endpoint, {
        onStatus: (status, text) => patchEndpoint(id, { status, statusText: text }),
        addMsg: (entry) => addMsg(id, entry),
        err: (message) => err(id, message),
      });
      clientsRef.current.set(id, client);
      try {
        client.connect();
      } catch (error) {
        patchEndpoint(id, { status: "error", statusText: "Error" });
        err(id, (error as Error).message);
      }
    },
    [addMsg, disconnect, endpointOf, err, patchEndpoint, saveEndpoints],
  );

  const wsSend = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Not connected.");
        return;
      }
      try {
        const byteCount = (clientsRef.current.get(id) as WSClient).send(endpoint.wsPayload);
        addMsg(id, { dir: "out", raw: endpoint.wsPayload, size: byteCount });
      } catch (error) {
        err(id, (error as Error).message);
      }
    },
    [addMsg, endpointOf, err, ready],
  );

  const stompSubscribe = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Connect first (STOMP needs a CONNECTED frame).");
        return;
      }
      const destination = endpoint.stompSubDest.trim();
      if (!destination) return;
      const subscriptionId = (clientsRef.current.get(id) as StompClient).subscribe(destination);
      addSubscription(id, { key: subscriptionId, kind: "stomp", label: destination });
      addMsg(id, { dir: "out", raw: "SUBSCRIBE " + destination, label: destination });
    },
    [addMsg, addSubscription, endpointOf, err, ready],
  );

  const stompSend = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Connect first.");
        return;
      }
      const destination = endpoint.stompSendDest.trim();
      const byteCount = (clientsRef.current.get(id) as StompClient).send(
        destination,
        endpoint.stompBody,
        rowsToObj(endpoint.stompSendHeaders),
      );
      addMsg(id, { dir: "out", raw: endpoint.stompBody, label: destination, size: byteCount });
    },
    [addMsg, endpointOf, err, ready],
  );

  const rsRequest = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Connect first (sends SETUP).");
        return;
      }
      const client = clientsRef.current.get(id) as RSocketClient;
      const route = endpoint.rsRoute.trim();
      const data = endpoint.rsData;
      const initialRequestN = parseInt(endpoint.rsInitialN, 10) || 2147483647;
      const sendTimes = sendTimesRef.current.get(id) ?? {};
      sendTimesRef.current.set(id, sendTimes);
      if (endpoint.rsModel === "rr") {
        const response = client.requestResponse(route, data, {
          onPayload: (payload) => {
            const sentAt = sendTimes[response.streamId];
            const latency = sentAt != null ? Math.round(util.now() - sentAt) : null;
            addMsg(id, { dir: "in", raw: payload, label: route, latency });
            if (latency != null) patchEndpoint(id, { latency });
          },
          onError: (code, message) => err(id, "RSocket error " + code + ": " + message),
        });
        sendTimes[response.streamId] = util.now();
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  request-response", size: response.bytes });
      } else if (endpoint.rsModel === "stream") {
        const streamResult = client.requestStream(route, data, initialRequestN, {
          onPayload: (payload) => addMsg(id, { dir: "in", raw: payload, label: route }),
          onComplete: () => {
            removeSub(id, streamResult.streamId);
            addMsg(id, { dir: "sys", raw: "Stream complete · " + route });
          },
          onError: (code, message) => {
            removeSub(id, streamResult.streamId);
            err(id, "RSocket error " + code + ": " + message);
          },
        });
        addSubscription(id, { key: streamResult.streamId, kind: "rsocket", label: route + " · stream" });
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  request-stream", size: streamResult.bytes });
      } else if (endpoint.rsModel === "channel") {
        const channelResult = client.requestChannel(route, data, initialRequestN, {
          onPayload: (payload) => addMsg(id, { dir: "in", raw: payload, label: route }),
          onComplete: () => {
            removeSub(id, channelResult.streamId);
            activeChannelRef.current.set(id, null);
            addMsg(id, { dir: "sys", raw: "Channel complete · " + route });
          },
          onError: (code, message) => {
            removeSub(id, channelResult.streamId);
            err(id, "RSocket error " + code + ": " + message);
          },
        });
        activeChannelRef.current.set(id, channelResult.streamId);
        addSubscription(id, { key: channelResult.streamId, kind: "rsocket", label: route + " · channel" });
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  request-channel (open)", size: channelResult.bytes });
      } else {
        const fireResult = client.fireAndForget(route, data);
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  fire-and-forget", size: fireResult.bytes });
      }
    },
    [addMsg, addSubscription, endpointOf, err, patchEndpoint, ready, removeSub],
  );

  const rsChannelPush = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      const channel = activeChannelRef.current.get(id);
      if (channel == null) {
        err(id, "No open channel — send a request-channel first.");
        return;
      }
      const byteCount = (clientsRef.current.get(id) as RSocketClient).sendPayload(
        channel,
        endpoint.rsData,
        false,
      );
      addMsg(id, { dir: "out", raw: endpoint.rsData, label: "channel push", size: byteCount });
    },
    [addMsg, endpointOf, err],
  );

  const rsChannelComplete = useCallback(
    (id: string) => {
      const channel = activeChannelRef.current.get(id);
      if (channel == null) return;
      (clientsRef.current.get(id) as RSocketClient).sendPayload(channel, "", true);
      addMsg(id, { dir: "sys", raw: "Channel completed by client" });
    },
    [addMsg],
  );

  const cancelSub = useCallback(
    (id: string, sub: Subscription) => () => {
      const client = clientsRef.current.get(id);
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
      if (sub.kind === "rsocket" && sub.key === activeChannelRef.current.get(id))
        activeChannelRef.current.set(id, null);
      removeSub(id, sub.key);
      addMsg(id, { dir: "sys", raw: "Cancelled · " + sub.label });
    },
    [addMsg, removeSub],
  );

  const closeAll = useCallback(() => {
    clientsRef.current.forEach((client) => {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    });
    clientsRef.current.clear();
    activeChannelRef.current.clear();
  }, []);

  return {
    clientsRef,
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
    clearMessages,
    closeAll,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors. (New file, type-checked but not yet imported.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add multi-socket connection manager keyed by endpoint"
```

---

### Task 4: EndpointList + EmptyState components

**Files:**
- Create: `src/components/EndpointList.tsx`
- Create: `src/components/EmptyState.tsx`

**Interfaces:**
- Consumes: `Endpoint`, `endpointDisplayName` from `../state/endpoint`; `badge`, `statusColors`, `MONO` from `../styles`.
- Produces:
  - `EndpointList` props: `{ endpoints: Endpoint[]; activeId: string | null; onSelect(id): void; onCreate(): void; onRename(id, name): void; onDelete(id): void }`.
  - `EmptyState` props: `{ onCreate(): void }`.

- [ ] **Step 1: Create `src/components/EmptyState.tsx`**

```tsx
import { MONO } from "../styles";

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0c10",
        minHeight: 0,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "420px", padding: "30px" }}>
        <div style={{ font: "700 15px " + MONO, color: "#8a93a4", marginBottom: "12px" }}>
          No endpoints yet
        </div>
        <div style={{ font: "13px/1.7 'IBM Plex Sans'", color: "#5a6270", marginBottom: "22px" }}>
          Create an endpoint to connect over WebSocket, STOMP, or RSocket. Each endpoint keeps its
          own connection and message log.
        </div>
        <button
          onClick={onCreate}
          className="sb-brighten"
          style={{
            background: "var(--accent,#2dd4a7)",
            border: "none",
            borderRadius: "8px",
            padding: "11px 20px",
            color: "#06120d",
            font: "600 13px 'IBM Plex Sans'",
            cursor: "pointer",
          }}
        >
          + Create your first endpoint
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/EndpointList.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { type Endpoint, endpointDisplayName } from "../state/endpoint";
import { badge, statusColors, MONO } from "../styles";

interface Props {
  endpoints: Endpoint[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/** Per-endpoint connection indicator: color by status, pulse when streaming/connecting. */
function StatusDot({ endpoint }: { endpoint: Endpoint }) {
  const color = statusColors[endpoint.status] || "#59616f";
  const pulsing = endpoint.status === "connecting" || endpoint.subscriptions.length > 0;
  return (
    <span
      title={endpoint.statusText}
      style={{
        flex: "none",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: color,
        boxShadow: endpoint.status === "open" ? "0 0 8px " + color : "none",
        animation: pulsing ? "sb-pulse 1.4s infinite" : "none",
      }}
    />
  );
}

function Row({ endpoint, active, onSelect, onRename, onDelete }: {
  endpoint: Endpoint;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  const commit = () => {
    onRename(endpoint.id, draft.trim());
    setEditing(false);
  };

  return (
    <div
      className="sb-row"
      onClick={() => onSelect(endpoint.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "9px 10px",
        borderRadius: "8px",
        marginBottom: "4px",
        cursor: "pointer",
        border: "1px solid " + (active ? "#232c39" : "transparent"),
        background: active ? "#11161e" : "transparent",
      }}
    >
      <StatusDot endpoint={endpoint} />
      <span style={badge(endpoint.protocol)}>{endpoint.protocol.toUpperCase()}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            style={{
              width: "100%",
              background: "#0c0f15",
              border: "1px solid #2a3340",
              borderRadius: "5px",
              padding: "3px 6px",
              color: "#dce1ea",
              font: "13px " + MONO,
              outline: "none",
            }}
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(endpoint.name);
              setEditing(true);
            }}
            style={{
              font: "600 13px " + MONO,
              color: "#dce1ea",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {endpointDisplayName(endpoint)}
          </div>
        )}
        <div
          style={{
            fontSize: "10px",
            color: "#59616f",
            marginTop: "2px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {endpoint.url || "no URL yet"}
        </div>
      </div>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onDelete(endpoint.id);
        }}
        className="sb-del"
        style={{
          flex: "none",
          color: "#4a525f",
          fontSize: "15px",
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: "4px",
        }}
      >
        ×
      </span>
    </div>
  );
}

export function EndpointList(props: Props) {
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#0b0e13",
        borderRight: "1px solid #1c232f",
        minHeight: 0,
      }}
    >
      <div style={{ padding: "15px 16px 13px", borderBottom: "1px solid #1c232f" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <div
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "3px",
              background: "var(--accent,#2dd4a7)",
              boxShadow: "0 0 12px var(--accent,#2dd4a7)",
            }}
          />
          <div style={{ font: "700 15px " + MONO, letterSpacing: ".02em", color: "#eef2f7" }}>
            socketbench
          </div>
        </div>
        <div
          style={{
            marginTop: "5px",
            font: "500 10.5px 'IBM Plex Sans'",
            color: "#59616f",
            letterSpacing: ".04em",
          }}
        >
          WS · STOMP · RSocket client
        </div>
      </div>

      <div style={{ padding: "10px 12px 4px" }}>
        <button
          onClick={props.onCreate}
          className="sb-hover-border"
          style={{
            width: "100%",
            background: "transparent",
            border: "1px dashed #2a3340",
            borderRadius: "8px",
            padding: "9px",
            color: "#8a93a4",
            font: "600 11.5px 'IBM Plex Sans'",
            cursor: "pointer",
          }}
        >
          + New endpoint
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", minHeight: 0 }}>
        {props.endpoints.map((endpoint) => (
          <Row
            key={endpoint.id}
            endpoint={endpoint}
            active={endpoint.id === props.activeId}
            onSelect={props.onSelect}
            onRename={props.onRename}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add endpoint list and empty-state components"
```

---

### Task 5: Switch App to the per-endpoint model; remove the old single-workspace system

**Files:**
- Modify: `src/components/Composer.tsx` (prop `state: AppState` → `endpoint: Endpoint` + `splitW`)
- Modify: `src/components/Results.tsx` (prop `state: AppState` → `endpoint: Endpoint`)
- Modify: `src/hooks/useSplitPane.ts` (type `AppState` → `WorkspaceState`)
- Modify: `src/lib/storage.ts` (drop legacy `history`/`form` keys)
- Create: `src/hooks/usePersistence.ts` content replaced (rewrite)
- Rewrite: `src/App.tsx`
- Delete: `src/components/Sidebar.tsx`, `src/hooks/useHistory.ts`, `src/hooks/useCollections.ts`, `src/hooks/useSocketConnection.ts`, `src/hooks/useMessageLog.ts`, `src/hooks/useHeaderRows.ts`, `src/state/appState.ts`, `src/state/useAppState.ts`

**Interfaces:**
- Consumes everything produced in Tasks 1–4.
- Produces: the running multi-endpoint app.

- [ ] **Step 1: Repoint `Composer` to a single `Endpoint` + `splitW`**

In `src/components/Composer.tsx`:
1. Change the type import line `import type { AppState } from "../state/appState";` to `import type { Endpoint } from "../state/endpoint";`.
2. In `interface Props`, change `state: AppState;` to:
   ```ts
   endpoint: Endpoint;
   splitW: number;
   ```
   and change every `keyof AppState` to `keyof Endpoint` (in the `setField`/`setFieldValue` member types).
3. Change the component signature `export function Composer({ state, ...props }: Props) {` to `export function Composer({ endpoint, splitW, ...props }: Props) {`.
4. Replace every `state.splitW` with `splitW`, and every other `state.` with `endpoint.` throughout the file body.

- [ ] **Step 2: Repoint `Results` to a single `Endpoint`**

In `src/components/Results.tsx`:
1. Change `import type { AppState } from "../state/appState";` to `import type { Endpoint } from "../state/endpoint";`.
2. In `interface Props`, change `state: AppState;` to `endpoint: Endpoint;`.
3. Change the signature `export function Results({ state, ...props }: Props) {` to `export function Results({ endpoint, ...props }: Props) {`.
4. Replace every `state.` in the file body with `endpoint.`.

- [ ] **Step 3: Repoint `useSplitPane` types**

In `src/hooks/useSplitPane.ts`, change `import type { AppState } from "../state/appState";` to `import type { WorkspaceState } from "../state/endpoint";` and change the `patch` parameter type from `Partial<AppState> | ((prev: AppState) => Partial<AppState>)` to `Partial<WorkspaceState>`. (App now passes `patch` from `useWorkspace`, whose signature is `(update: Partial<WorkspaceState>) => void`.)

- [ ] **Step 4: Rewrite `src/hooks/usePersistence.ts`**

Replace the entire file with:
```ts
import { useEffect } from "react";
import { KEYS, write } from "../lib/storage";
import type { Settings } from "../types";

interface Deps {
  settings: Settings;
  saveEndpoints: () => void;
  closeAll: () => void;
}

export function usePersistence({ settings, saveEndpoints, closeAll }: Deps) {
  useEffect(() => write(KEYS.settings, settings), [settings]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveEndpoints);
    return () => {
      saveEndpoints();
      closeAll();
      window.removeEventListener("beforeunload", saveEndpoints);
    };
  }, [saveEndpoints, closeAll]);
}
```

- [ ] **Step 5: Rewrite `src/App.tsx`**

```tsx
import { useCallback, type CSSProperties } from "react";
import { EndpointList } from "./components/EndpointList";
import { EmptyState } from "./components/EmptyState";
import { ConnectionBar } from "./components/ConnectionBar";
import { Composer } from "./components/Composer";
import { Results } from "./components/Results";
import { useWorkspace } from "./state/useWorkspace";
import {
  type Endpoint,
  DEFAULT_ENDPOINT,
  ENDPOINT_CONFIG_KEYS,
  endpointDisplayName,
} from "./state/endpoint";
import { KEYS, write } from "./lib/storage";
import { useConnections } from "./hooks/useConnections";
import { useSplitPane } from "./hooks/useSplitPane";
import { usePersistence } from "./hooks/usePersistence";
import { rootStyle, dividerStyle, dividerHandleStyle } from "./styles";

export function App() {
  const { state, setState, patch, stateRef, updateEndpoint, patchEndpoint } = useWorkspace();
  const active = state.endpoints.find((e) => e.id === state.activeEndpointId) ?? null;

  const saveEndpoints = useCallback(() => {
    const snapshot = stateRef.current;
    const configs = snapshot.endpoints.map((endpoint) => {
      const config: Record<string, unknown> = {};
      const source = endpoint as unknown as Record<string, unknown>;
      ENDPOINT_CONFIG_KEYS.forEach((key) => (config[key] = source[key]));
      return config;
    });
    write(KEYS.endpoints, configs);
    write(KEYS.activeEndpoint, snapshot.activeEndpointId);
  }, [stateRef]);

  const conn = useConnections({ stateRef, updateEndpoint, patchEndpoint, saveEndpoints });
  const { splitElRef, onDragStart } = useSplitPane(patch);
  usePersistence({ settings: state.settings, saveEndpoints, closeAll: conn.closeAll });

  /* ---------------- endpoint CRUD ---------------- */
  const createEndpoint = useCallback(() => {
    const endpoint = DEFAULT_ENDPOINT();
    setState((prev) => ({
      ...prev,
      endpoints: prev.endpoints.concat([endpoint]),
      activeEndpointId: endpoint.id,
    }));
    saveEndpoints();
  }, [saveEndpoints, setState]);

  const selectEndpoint = (id: string) => {
    patch({ activeEndpointId: id });
    saveEndpoints();
  };
  const renameEndpoint = (id: string, name: string) => {
    patchEndpoint(id, { name });
    saveEndpoints();
  };
  const deleteEndpoint = (id: string) => {
    const endpoint = stateRef.current.endpoints.find((e) => e.id === id);
    if (!endpoint) return;
    if (!window.confirm(`Delete endpoint "${endpointDisplayName(endpoint)}"? This closes its connection.`))
      return;
    conn.disconnect(id, true);
    setState((prev) => {
      const endpoints = prev.endpoints.filter((e) => e.id !== id);
      const activeEndpointId =
        prev.activeEndpointId === id ? (endpoints[0]?.id ?? null) : prev.activeEndpointId;
      return { ...prev, endpoints, activeEndpointId };
    });
    saveEndpoints();
  };

  /* ---------------- active-endpoint field setters ---------------- */
  const setField =
    (field: keyof Endpoint) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (active) patchEndpoint(active.id, { [field]: event.target.value } as Partial<Endpoint>);
    };
  const setFieldValue = (field: keyof Endpoint) => (value: string) => {
    if (active) patchEndpoint(active.id, { [field]: value } as Partial<Endpoint>);
  };
  const setHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", index: number, column: "key" | "value") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!active) return;
      const value = event.target.value;
      updateEndpoint(active.id, (e) => {
        const rows = e[field].slice();
        rows[index] = { ...rows[index], [column]: value };
        return { ...e, [field]: rows };
      });
    };
  const addHeader = (field: "stompConnectHeaders" | "stompSendHeaders") => () => {
    if (active)
      updateEndpoint(active.id, (e) => ({ ...e, [field]: e[field].concat([{ key: "", value: "" }]) }));
  };
  const removeHeader =
    (field: "stompConnectHeaders" | "stompSendHeaders", index: number) => () => {
      if (active)
        updateEndpoint(active.id, (e) => {
          const rows = e[field].filter((_, position) => position !== index);
          return { ...e, [field]: rows.length ? rows : [{ key: "", value: "" }] };
        });
    };

  const connected = active?.status === "open";
  const busy = active?.status === "connecting";
  const root: CSSProperties = rootStyle(state.settings);

  return (
    <div style={root}>
      <EndpointList
        endpoints={state.endpoints}
        activeId={state.activeEndpointId}
        onSelect={selectEndpoint}
        onCreate={createEndpoint}
        onRename={renameEndpoint}
        onDelete={deleteEndpoint}
      />

      {active ? (
        <main key={active.id} style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <ConnectionBar
            protocol={active.protocol}
            url={active.url}
            status={active.status}
            statusText={active.statusText}
            latency={active.latency}
            settings={state.settings}
            connected={!!connected}
            busy={!!busy}
            onProtocol={(protocol) => patchEndpoint(active.id, { protocol })}
            onUrl={setField("url")}
            onToggleConnect={
              connected || busy ? () => conn.disconnect(active.id, false) : () => conn.connect(active.id)
            }
            onAccent={(accent) => patch({ settings: { ...state.settings, accent } })}
            onDensity={(density) => patch({ settings: { ...state.settings, density } })}
          />

          <div
            ref={splitElRef}
            style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0, minWidth: 0 }}
          >
            <Composer
              endpoint={active}
              splitW={state.splitW}
              setField={setField}
              setFieldValue={setFieldValue}
              setHeader={setHeader}
              addHeader={addHeader}
              removeHeader={removeHeader}
              onProtoModel={(model) => patchEndpoint(active.id, { rsModel: model })}
              wsSend={() => conn.wsSend(active.id)}
              stompSubscribe={() => conn.stompSubscribe(active.id)}
              stompSend={() => conn.stompSend(active.id)}
              rsRequest={() => conn.rsRequest(active.id)}
              rsChannelPush={() => conn.rsChannelPush(active.id)}
              rsChannelComplete={() => conn.rsChannelComplete(active.id)}
            />

            <div className="sb-divider" onMouseDown={onDragStart} style={dividerStyle}>
              <div style={dividerHandleStyle} />
            </div>

            <Results
              endpoint={active}
              onTab={(tab) => patchEndpoint(active.id, { resultTab: tab })}
              onFilter={setField("filterText")}
              onFilterDir={(direction) => patchEndpoint(active.id, { filterDir: direction })}
              onClear={() => conn.clearMessages(active.id)}
              onCancelSub={(sub) => conn.cancelSub(active.id, sub)}
              onFillSample={() => patchEndpoint(active.id, { protocol: "ws", url: "wss://ws.postman-echo.com/raw" })}
            />
          </div>
        </main>
      ) : (
        <EmptyState onCreate={createEndpoint} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Delete the superseded files**

```bash
git rm src/components/Sidebar.tsx src/hooks/useHistory.ts src/hooks/useCollections.ts src/hooks/useSocketConnection.ts src/hooks/useMessageLog.ts src/hooks/useHeaderRows.ts src/state/appState.ts src/state/useAppState.ts
```

- [ ] **Step 7: Drop the legacy `history`/`form` storage keys**

Now that `appState.ts` is gone, in `src/lib/storage.ts` set `KEYS` to its final form:
```ts
export const KEYS = {
  collections: "sktool.collections", // legacy — read once for migration
  settings: "sktool.settings",
  endpoints: "sktool.endpoints",
  activeEndpoint: "sktool.activeEndpoint",
} as const;
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors. If TS reports an unused import or symbol, remove it (e.g. confirm `Composer`/`Results` no longer reference `AppState`).

Run: Grep pattern `useSocketConnection|useAppState|appState|useCollections|useHistory|Sidebar` path `src` → expect no matches (all superseded references gone).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: switch to multi-endpoint workspace; remove single-workspace system"
```

---

### Task 6: Final verification and manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full clean build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Structure sanity checks**

Run: Grep pattern `sktool.history|sktool.form` path `src` → expect no matches.
Run: Grep pattern `EndpointList|EmptyState|useConnections|useWorkspace` path `src` → expect matches in `App.tsx` plus their own files.
Run: Glob `src/state/*.ts` → expect `endpoint.ts`, `useWorkspace.ts` (no `appState.ts`/`useAppState.ts`).

- [ ] **Step 3: Manual smoke in `npm run dev`** — confirm:
  - Cleared storage → empty canvas with centered "Create your first endpoint" button.
  - Create two endpoints; give them different protocols/URLs; connect both. Each has an independent log; the sidebar status dot reflects each endpoint's state (grey/amber/green, pulse while connecting or while a subscription is open, red on error).
  - Switch endpoints — each shows its own messages/subscriptions/result-tab/filter; the background endpoint keeps its connection and keeps logging.
  - Double-click a name to rename; the sidebar label updates and persists.
  - Delete an endpoint → confirm dialog; on confirm its socket closes and the active selection re-points to a neighbor (or empty state when none remain).
  - WS / STOMP / RSocket send/subscribe/cancel/channel all behave as before, scoped to the active endpoint.
  - Reload → endpoint configs restored, logs/connections cleared; reconnect works.
  - If pre-existing saved Collections were in storage before upgrade, they appear as endpoints on first load.
  - Payload editors (CodeMirror, full height) and accent/density settings still work.

- [ ] **Step 4: Final commit** (only if cleanup was needed; otherwise skip)

```bash
git add -A
git commit -m "chore: finalize multi-endpoint workspace"
```

---

## Self-Review Notes

- **Spec coverage:** endpoints-replace-collections+history (Task 2 migration + Task 5 deletions); per-endpoint connection/log/runtime (Tasks 1–3); background concurrency + sidebar status dot/pulse (Task 3 manager + Task 4 `StatusDot`); empty state (Task 4 + App branch); create-blank-inline (App `createEndpoint`); rename (EndpointList inline edit), delete-with-confirm (App `deleteEndpoint`); single active view + workspace `key={active.id}` (App); config-persist/runtime-reset + migration (Task 2 `loadWorkspaceState`, App `saveEndpoints`); view-state on endpoint, `splitW` global (Task 1 model, App wiring); settings global (App). All covered.
- **Type consistency:** `WorkspaceState`/`Endpoint` defined in Task 1, consumed identically in Tasks 2–5; `useWorkspace` returns `{ state, setState, patch, stateRef, updateEndpoint, patchEndpoint }` (Task 2) used verbatim in App (Task 5); `useConnections` ops all take `(id, …)` (Task 3) and App calls them with `active.id` (Task 5); `createClient(config: ClientConfig)` (Task 1) accepts `Endpoint` (Task 3 `connect`). `ENDPOINT_CONFIG_KEYS` used by both `rehydrate` (Task 2) and `saveEndpoints` (Task 5).
- **No placeholders:** every code step contains complete code; component repoints (Steps 1–2 of Task 5) are mechanical `state.`→`endpoint.` renames with the exact signature/Props edits given.
- **Green-per-task:** Tasks 1–4 add type-checked-but-unimported files (+ the non-breaking `clientFactory`/`KEYS` edits guarded by Step 1b); the breaking switch is isolated to Task 5, green at its end.
