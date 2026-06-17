# SocketBench — Modularization & Separation-of-Concerns Refactor

**Date:** 2026-06-17
**Status:** Approved (design)
**Type:** Internal refactor — no behavior change, no visual change, no new dependencies

## Goal

Break up the 733-line `App.tsx` god component into focused, single-purpose
modules so the codebase has clear separation of concerns, high cohesion, and no
duplicated logic. Behavior and pixel output must remain identical; `tsc -b &&
vite build` must stay green.

## Problem (current state)

`src/App.tsx` (733 lines) mixes at least eight concerns:

1. State shape + defaults (`AppState`, `DEFAULT_STATE`, `FORM_KEYS`)
2. localStorage persistence (`loadInitialState`, 3 effects, `saveForm`)
3. Connection lifecycle (`connect`/`disconnect`, three inline client builders)
4. Message log (`addMsg`, `err`, `clearMessages`)
5. Per-protocol send/subscribe (`wsSend`, `stompSubscribe`, `stompSend`,
   `rsRequest`, `rsChannelPush`, `rsChannelComplete`, `cancelSub`, `removeSub`)
6. Header-row editing (`setHeader`, `addHeader`, `removeHeader`, `rowsToObj`)
7. Collections/history (`saveCollection`, `loadCollection`, `deleteCollection`,
   `pushHistory`, `loadHistory`, `clearHistory`, `defaultName`, `leaf`)
8. Split-pane drag + theme/CSS-var derivation + layout render

**DRY violations:**
- The three client builders in `connect` repeat the `patch({status})` + `err()`
  pattern.
- Subscription append is duplicated 3× (`setS(prev => …concat([…]))`).
- localStorage `try/catch` repeated 4×.
- Magic colors/sizes (`#0a0c10`, `#1c232f`, spacing) scattered across files.

`src/lib/socketClients.ts` (525 lines) bundles four concerns in one file:
shared codec/util primitives, the WS client, the STOMP client, and the RSocket
client — and within RSocket, the binary frame codec (`FT`/`FLAG`/`concat`/
`u32`/`u24`/`u16`/`header`/`routingMetadata`) is interleaved with the client
state machine. The three protocols are independent and should not share a file.

## Decisions (from brainstorming)

- **Approach:** Decompose into focused custom hooks. No global store, no new
  dependency. (User chose "Custom hooks".)
- **State:** Stays centralized in a single `useAppState` (`useState<AppState>` +
  `patch` + live `sRef`). Feature hooks receive what they need and return
  handlers. (User confirmed "using 1 appState is ok".) This preserves the
  existing `sRef.current` live-snapshot pattern that socket-event closures rely
  on, keeping behavior identical.
- **Styling:** Keep the inline `CSSProperties` approach (zero regression risk)
  but consolidate magic values into a tokens module and split `styles.ts` into a
  `styles/` folder with a barrel so component imports stay stable. (User chose
  "Keep inline, consolidate tokens".)

## Target structure

```
src/
  state/
    appState.ts        AppState type, DEFAULT_STATE, FORM_KEYS, loadInitialState()
    useAppState.ts     single useState<AppState> + patch() + live sRef snapshot
  lib/
    storage.ts         typed read<T>()/write() wrapping try/catch + sktool.* keys
    clientFactory.ts   builds the right AnyClient (collapses 3 inline builders)
    util.ts            leaf(), rowsToObj() (pure helpers)
    clients/           protocol engines, split per concern (was socketClients.ts)
      index.ts         barrel: WSClient, StompClient, RSocketClient, AnyClient,
                       *Opts/Handlers types, util
      util.ts          shared primitives: enc/dec, byteLen, tryParseJSON,
                       formatBytes, now, util object
      ws.ts            WSClient + WSClientOpts
      stomp.ts         StompClient + StompClientOpts + NULL + frame parse/build
      rsocket/
        frames.ts      binary codec: FT, FLAG, concat, u32/u24/u16, header,
                       routingMetadata (pure, no client state)
        client.ts      RSocketClient + RSocketClientOpts + RSocketStreamHandlers
  hooks/
    useMessageLog.ts   addMsg, err, clearMessages
    useHistory.ts      pushHistory, loadHistory, clearHistory
    useSocketConnection.ts  clientRef, connect, disconnect, ready + send/sub ops
    useCollections.ts  saveCollection, loadCollection, deleteCollection, defaultName
    useHeaderRows.ts   setHeader, addHeader, removeHeader
    useSplitPane.ts    drag refs/effect, onDragStart
    usePersistence.ts  3 localStorage effects + saveForm + beforeunload
  styles/
    index.ts           barrel re-export (components keep `from "../styles"`)
    tokens.ts          colors / radii / spacing constants
    controls.ts        seg, pill, sideTab, badge, protoColor, badgeTint,
                       dirMeta, statusColors
    layout.ts          rootStyle(settings), dividerStyle, fmtTime
  components/          unchanged props/behavior; import paths only
  App.tsx              ~110 lines: compose hooks + render layout
```

## Module responsibilities & interfaces

### `state/appState.ts`
- Exports `AppState` interface, `DEFAULT_STATE`, `FORM_KEYS`, `loadInitialState()`.
- `loadInitialState()` reads localStorage via `lib/storage.ts` and overlays
  DEFAULT_STATE (same logic as today).

### `state/useAppState.ts`
- `useAppState()` → `{ s, setS, patch, sRef }`.
- `patch(p | (prev) => p)` merges into state (current behavior).
- `sRef` is a ref kept in sync with `s` each render (live snapshot).

### `lib/storage.ts`
- `read<T>(key): T | null` and `write(key, value): void`, each wrapping
  `try/catch`. Centralizes the `sktool.collections|history|form|settings` keys
  as named constants.

### `lib/clientFactory.ts`
- `createClient(state, handlers): AnyClient` where `handlers` is
  `{ onStatus(status, text), addMsg, err }`. Switches on `state.protocol` and
  returns a configured `WSClient | StompClient | RSocketClient`, replacing the
  three inline builders. Pure (no React). Imports the clients from
  `./clients`.

### `lib/clients/` (split of current `socketClients.ts`)
- `util.ts`: cross-protocol primitives — `enc`/`dec` (TextEncoder/Decoder),
  `byteLen`, `tryParseJSON`, `formatBytes`, `now`, and the `util` object. Moved
  verbatim.
- `ws.ts`: `WSClient` + `WSClientOpts`. Imports `byteLen`/`dec` from `./util`.
- `stomp.ts`: `StompClient` + `StompClientOpts` + `NULL` const + frame
  parse/build (`_onData`/`_handleFrame`/`_sendFrame`). Imports from `./util`.
- `rsocket/frames.ts`: pure binary codec — `FT`, `FLAG`, `concat`, `u32`,
  `u24`, `u16`, `header`, `routingMetadata`. Imports `enc` from `../util`. No
  client state.
- `rsocket/client.ts`: `RSocketClient` + `RSocketClientOpts` +
  `RSocketStreamHandlers`. Imports the codec from `./frames` and primitives
  from `../util`.
- `index.ts`: barrel re-exporting `WSClient`, `StompClient`, `RSocketClient`,
  `AnyClient`, all `*Opts`/`*Handlers` types, and `util`. New public entry
  point; importers switch `./lib/socketClients` → `./lib/clients`.
- All class bodies move **verbatim** (only import wiring changes).

### `lib/util.ts`
- `leaf(str)` and `rowsToObj(rows)` moved verbatim from App (pure).

### `hooks/useMessageLog.ts`
- `useMessageLog(setS)` → `{ midRef, addMsg, err, clearMessages }`.
- `addMsg` keeps the `++midRef.current`, JSON-parse, 1000-cap behavior.

### `hooks/useHistory.ts`
- `useHistory(setS, sRef)` → `{ pushHistory, loadHistory, clearHistory }`.

### `hooks/useSocketConnection.ts`
- `useSocketConnection({ patch, setS, sRef, addMsg, err, pushHistory, saveForm })`
  → `{ clientRef, connect, disconnect, ready, wsSend, stompSubscribe,
  stompSend, rsRequest, rsChannelPush, rsChannelComplete, cancelSub, removeSub }`.
- Owns `clientRef`, `sendTimesRef`, `activeChannelRef`.
- Internal `addSubscription(sub)` helper replaces the 3 duplicated append blocks.
- `connect` uses `clientFactory.createClient`.

### `hooks/useCollections.ts`
- `useCollections({ setS, sRef, patch, err })` → `{ saveCollection,
  loadCollection, deleteCollection }`. `defaultName`/`leaf` via `lib/util`.

### `hooks/useHeaderRows.ts`
- `useHeaderRows(setS)` → `{ setHeader, addHeader, removeHeader }`.

### `hooks/useSplitPane.ts`
- `useSplitPane(patch)` → `{ splitElRef, onDragStart }`. Owns `draggingRef` and
  the mousemove/mouseup effect.

### `hooks/usePersistence.ts`
- `usePersistence({ s, sRef })` → `{ saveForm }`. Runs the 3 slice effects
  (collections/history/settings) and registers `beforeunload`/cleanup. Note:
  `saveForm` is needed by both connection (`connect`) and persistence
  (`beforeunload`); it will live here and be passed into `useSocketConnection`,
  OR `saveForm` moves to a tiny standalone `useCallback` in App and is passed to
  both. Implementation plan picks one — default: define `saveForm` in
  `usePersistence` and have App pass it down.

### `styles/` (split of current `styles.ts`)
- `tokens.ts`: named constants for the palette and spacing used across files.
- `controls.ts`: `seg`, `pill`, `sideTab`, `badge`, `protoColor`, `badgeTint`,
  `dirMeta`, `statusColors` (referencing tokens).
- `layout.ts`: `rootStyle(settings)`, `dividerStyle`, `fmtTime`, plus the
  divider markup styling currently inline in App.
- `index.ts`: re-exports everything so `import { seg } from "../styles"` keeps
  working unchanged in all components.

### `App.tsx`
- Calls `useAppState`, then the feature hooks in dependency order:
  `useMessageLog` → `useHistory` → `useSocketConnection` → `useCollections` →
  `useHeaderRows` → `useSplitPane` → `usePersistence`.
- Renders `<Sidebar>`, `<main>` with `<ConnectionBar>`, the split container,
  `<Composer>`, divider, `<Results>` — same JSX/props as today.

## Hook dependency order

```
useAppState        (s, setS, patch, sRef)
  └ useMessageLog  (addMsg, err, clearMessages)
  └ useHistory     (pushHistory, loadHistory, clearHistory)
  └ useSocketConnection  (uses addMsg, err, pushHistory, saveForm)
  └ useCollections (uses err)
  └ useHeaderRows
  └ useSplitPane
  └ usePersistence (provides saveForm)
```

`saveForm` is produced by `usePersistence` and threaded into
`useSocketConnection`; App wires this. (Both consume it; persistence defines it.)

## Non-goals (YAGNI)

- No global state store / context.
- No CSS Modules migration.
- No feature changes, no new protocols, no export/auth features.
- No changes to `components/*` props or rendered output (only import paths).
- No logic changes to the protocol engines — classes move verbatim into
  `lib/clients/`; only file boundaries and import wiring change.

## Testing / acceptance

- `npm run build` (`tsc -b && vite build`) passes with no TS errors and no
  unused-symbol errors (`noUnusedLocals`/`noUnusedParameters` are on).
- Manual smoke in dev: protocol switch, connect/disconnect, WS send, STOMP
  subscribe/send, RSocket request/stream/channel, collections save/load/delete,
  history, split-pane drag, accent/density tweaks, persistence across reload —
  all behave as before.
- No visual diff vs. current build.

## Risks

- **Hook wiring / dependency cycles:** mitigated by the fixed order above and by
  keeping state centralized (hooks take `patch`/`setS`/`sRef`, not each other's
  state).
- **Stale-closure regressions:** mitigated by preserving the `sRef` live-snapshot
  exactly as today; handlers read `sRef.current`, not captured `s`.
- **Import churn:** mitigated by the `styles/index.ts` barrel.
```
