# SocketBench Payload Editor — Design

**Date:** 2026-06-18
**Branch:** refine/payload-json-editor
**Status:** Approved

## Problem

Two issues in the Composer's payload editors:

1. **Layout:** The WebSocket message payload (and the other payload boxes) use a fixed-`minHeight` `<textarea>` that does not grow to fill the panel. The editor should cover the whole remaining height of the Composer panel.
2. **Performance:** Typing in a payload box feels very slow. The root cause is **not** the `<textarea>` — it is a full-app re-render cascade. All UI lives in one centralized `AppState`; every keystroke calls `patch` → `setState`, producing a new state object that re-renders the entire tree, including the `Results` panel. `Results` re-runs message filtering and renders every `MessageCard`, each of which runs `JsonView`'s regex syntax-highlighting. With many messages this is expensive on every keystroke.

The user also wants a real JSON code editor (syntax highlighting, bracket matching, line numbers) for the payload panels, not a plain textarea.

## Goals

- Replace the three Composer payload editors with a single reusable JSON code editor (CodeMirror 6).
- Make the editor fill the remaining height of the panel (where layout allows).
- Eliminate the typing lag by stopping the expensive work from re-running on every keystroke.

## Non-goals

- No JSON validation / linting / error squiggles (easy to add later; out of scope now).
- No change to socket/protocol logic, state shape, persistence, or visual theme/colors.
- No change to the read-only `JsonView` used in the Results panel.
- No broader refactoring beyond what these two fixes require.

## Decisions (from brainstorming)

- **Goal:** both — fix the lag AND add a JSON editor.
- **Library:** CodeMirror 6 (`@uiw/react-codemirror`), over Monaco (too heavy) and react-simple-code-editor+Prism (not a true editor).
- **Scope:** all three payload editors — WS message payload, STOMP send body, RSocket data payload — via one reusable component.
- **Performance approach:** **A — surgical memoization** (memoize the heavy leaf components). Escalate to full isolation (B) later only if lag persists at large message counts.
- **Line numbers:** on (code-editor feel).

## Dependencies (new)

- `@uiw/react-codemirror` — React wrapper for CodeMirror 6 (bundles CM core: state/view/commands/language).
- `@codemirror/lang-json` — JSON language support (highlighting, bracket matching).
- `@uiw/codemirror-themes` — `createTheme` helper to build a custom dark theme matching the existing palette.

Bundle impact: CodeMirror adds roughly a few hundred KB to the JS bundle (currently ~189 KB). Acceptable; the editor is part of the always-visible Composer, so lazy-loading offers little benefit and is not done.

## Components

### `src/components/JsonEditor.tsx` (new)

A thin wrapper around `@uiw/react-codemirror`, reused by all three payload editors.

**Props:**
```ts
interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  fillHeight?: boolean; // true -> editor fills its flex parent (height 100%, internal scroll)
  minHeight?: string;   // used when not fillHeight (e.g. "96px" for the STOMP body)
}
```

**Behavior / config:**
- Extensions: `json()`.
- `basicSetup`: line numbers ON, bracket matching ON, code folding OFF, highlight-active-line subtle/off to keep it clean.
- Theme: custom dark theme via `createTheme`, reusing existing tokens so it looks native:
  - editor background `#0c0f15` (matches current field background), text `#cdd6e0`, font IBM Plex Mono, gutter background transparent / `#0c0f15` with faint `#3f4754` line numbers.
  - JSON token colors identical to `JsonView`: keys `#58a6ff`, string values `#7ee0b5`, numbers `#f5c451`, bool/null `#d2a8ff`, punctuation dim `#5a6270`.
  - caret + selection use the accent (`var(--accent,#2dd4a7)`).
- The CodeMirror `value` is controlled by `value`; `onChange(value)` is called with the full document string. The library diffs document updates, so the controlled round-trip (onChange → state → value) does not move the caret.

**Why a wrapper:** one place owns the editor config and theme; the three call sites stay declarative and identical (DRY). Consumers can understand it from its props without reading CodeMirror internals.

### `src/components/Composer.tsx` (modified)

- Replace the three `<textarea>` editors (WS `wsPayload`, STOMP `stompBody`, RSocket `rsData`) with `<JsonEditor>`.
- **Full-height layout:** the Composer content container becomes a `height: 100%` flex column (`boxSizing: border-box`). The editor's wrapping section gets `flex: 1; minHeight: 0`; the `JsonEditor` is rendered with `fillHeight` so it fills that space (`height: 100%`, internal `.cm-scroller` scroll).
  - WS: payload section is the last block → fills all remaining height.
  - RSocket: data payload section is the last block → fills remaining height.
  - STOMP: two-column grid; the send-card body uses `fillHeight` so it fills the card (the card already uses `flex: 1` for the body). The connect-headers/subscribe column is unaffected.
- The sub-protocol input, STOMP destination/headers, RSocket route/initialN rows keep their current sizing; only the payload/body editors change.

### `src/components/Results.tsx` (modified — performance)

- Wrap `MessageCard` in `React.memo`. Message objects are immutable (created once in `addMsg`), so on a payload keystroke their props are unchanged and React skips re-rendering them — this is where the per-message `JsonView` regex cost lives.
- Wrap `Metrics` in `React.memo`. Its `messages` prop reference is unchanged on a payload keystroke, so the metric computation is skipped.
- No change to `Results`' own props or the filtering logic; the outer shell still re-renders on each keystroke but only does cheap work (an O(n) filter and creating elements whose memoized children bail out of re-render).

### `src/App.tsx` (modified — wiring)

- Add a small string-valued setter mirroring the existing `setField`:
  ```ts
  const setFieldValue =
    (field: keyof AppState) => (value: string) =>
      patch({ [field]: value } as Partial<AppState>);
  ```
  Pass it to `Composer`. The editors call `setFieldValue("wsPayload")` etc. with the raw string (CodeMirror's `onChange` provides a value, not a DOM event, so the event-based `setField` does not fit).
- No other changes. `wsSend` / `stompSend` / `rsRequest` continue to read `stateRef.current.*`, so send behavior is unchanged.

## Data flow

Keystroke in editor → `JsonEditor onChange(value)` → `setFieldValue(field)(value)` → `patch` → `setState`.
`stateRef.current` updates each render (unchanged live-snapshot contract). App + Composer re-render; memoized `MessageCard`/`Metrics` skip; `value` flows back to CodeMirror (no-op diff). Net effect: smooth typing.

## Error handling

- Editor accepts any text (including invalid JSON); no validation added. Sending invalid JSON behaves exactly as today (the raw string is sent; `JsonView`/`tryParseJSON` already handle non-JSON gracefully in Results).
- CodeMirror controlled-value round-trip is caret-safe via the library's document diffing.

## Testing / verification

- No test framework in this project; the gate is `npm run build` (`tsc -b && vite build`) passing with zero errors.
- Manual smoke (browser): typing in WS payload is smooth even with many messages in Results; WS/RSocket editors fill the panel height; STOMP body fills its card; syntax highlighting + line numbers + bracket matching work; send still transmits the current editor contents for all protocols; theme matches the dark UI.

## Files touched

- `package.json` / lockfile — add 3 dependencies.
- `src/components/JsonEditor.tsx` — new.
- `src/components/Composer.tsx` — use `JsonEditor`, full-height layout.
- `src/components/Results.tsx` — `React.memo` on `MessageCard` and `Metrics`.
- `src/App.tsx` — add `setFieldValue`, pass to `Composer`.

## Risks

- **Bundle size** grows with CodeMirror. Accepted.
- **CodeMirror height in flex containers** needs the theme to set `&{height:100%}` and `.cm-scroller{overflow:auto}` for `fillHeight` to work — covered in `JsonEditor`.
- **Approach A residual jank** at very large message counts is possible (the Results shell still re-renders). Mitigation path is documented (escalate to approach B: slice props + `React.memo` on `Results`).
