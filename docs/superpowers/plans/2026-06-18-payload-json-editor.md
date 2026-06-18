# Payload JSON Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three Composer payload textareas with a reusable CodeMirror 6 JSON editor that fills the panel height, and eliminate the per-keystroke typing lag.

**Architecture:** A single `JsonEditor` wrapper (CodeMirror 6 + custom dark theme matching the existing palette) is used by the WS payload, STOMP body, and RSocket data editors. The Composer content becomes a full-height flex column so the editors grow to fill the panel. Typing lag is removed by memoizing the heavy `Results` leaf components (`MessageCard`, `Metrics`) so they skip re-rendering on payload keystrokes.

**Tech Stack:** React 18 + hooks, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters` on), Vite 6, CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-json`, `@uiw/codemirror-themes`).

## Global Constraints

- **Verification is the build, not unit tests.** No test framework exists; do not add one. Each task's gate is `npm run build` (`tsc -b && vite build`) passing with zero errors, from `G:\.projects\sockit`.
- **No change to socket/protocol logic, state shape (`AppState`), persistence, or the theme colors.** Only the payload editors, Composer layout, the `Results` memoization, and one App wiring prop change.
- **Reuse the existing palette.** The editor's JSON token colors must match `JsonView`: keys `#58a6ff`, strings `#7ee0b5`, numbers `#f5c451`, bool/null `#d2a8ff`, punctuation `#5a6270`. Editor background `#0c0f15`, text `#cdd6e0`, font `MONO` (IBM Plex Mono), gutter line numbers `#3f4754`, caret/selection use the accent.
- **No JSON validation/linting** (highlighting + bracket matching + line numbers only).
- **Git:** commit after each task. Commit messages must read as human-authored — no mention of AI/Claude/generated.

---

### Task 1: Add CodeMirror dependencies and create the `JsonEditor` component

**Files:**
- Modify: `package.json` (+ lockfile) — add dependencies
- Create: `src/components/JsonEditor.tsx`

**Interfaces:**
- Consumes: `MONO` from `src/styles`.
- Produces: `JsonEditor` React component with props
  `{ value: string; onChange: (value: string) => void; fillHeight?: boolean; minHeight?: string }`.

- [ ] **Step 1: Install the dependencies**

Run (from `G:\.projects\sockit`):
```bash
npm install @uiw/react-codemirror @codemirror/lang-json @uiw/codemirror-themes @lezer/highlight
```
Expected: the four packages appear under `dependencies` in `package.json`; `npm` exits 0.

- [ ] **Step 2: Create `src/components/JsonEditor.tsx`**

```tsx
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { createTheme } from "@uiw/codemirror-themes";
import { tags } from "@lezer/highlight";
import { MONO } from "../styles";

/** Dark CodeMirror theme matching the SocketBench palette + JsonView colors. */
const editorTheme = createTheme({
  theme: "dark",
  settings: {
    background: "#0c0f15",
    foreground: "#cdd6e0",
    caret: "var(--accent,#2dd4a7)",
    selection: "rgba(45,212,167,.20)",
    selectionMatch: "rgba(45,212,167,.20)",
    lineHighlight: "transparent",
    gutterBackground: "#0c0f15",
    gutterForeground: "#3f4754",
    fontFamily: MONO,
  },
  styles: [
    { tag: tags.propertyName, color: "#58a6ff" }, // JSON keys
    { tag: tags.string, color: "#7ee0b5" }, // string values
    { tag: tags.number, color: "#f5c451" }, // numbers
    { tag: [tags.bool, tags.null], color: "#d2a8ff" }, // bool / null
    {
      tag: [tags.separator, tags.punctuation, tags.squareBracket, tags.brace],
      color: "#5a6270",
    }, // structural punctuation
  ],
});

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** When true the editor fills its flex parent (height 100%, internal scroll). */
  fillHeight?: boolean;
  /** Fixed min height used when not fillHeight (e.g. "120px"). */
  minHeight?: string;
}

export function JsonEditor({ value, onChange, fillHeight, minHeight }: JsonEditorProps) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={editorTheme}
      extensions={[json()]}
      height={fillHeight ? "100%" : undefined}
      minHeight={fillHeight ? undefined : minHeight || "120px"}
      style={fillHeight ? { height: "100%" } : undefined}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        bracketMatching: true,
        autocompletion: false,
      }}
    />
  );
}
```

Notes for the implementer: `@uiw/react-codemirror`'s `onChange` is `(value: string, viewUpdate) => void`; passing a `(value: string) => void` is fine (the extra arg is ignored). The `tags` import is from `@lezer/highlight` (a transitive dep of `@uiw/codemirror-themes`, installed explicitly in Step 1 so the import resolves).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors. (`JsonEditor` is not yet imported anywhere — that is fine; the file itself compiles. `noUnusedLocals` flags unused *locals within a file*, not unused exports.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add CodeMirror JSON editor component"
```

---

### Task 2: Wire `JsonEditor` into the Composer (all three editors) with full-height layout

**Files:**
- Modify: `src/App.tsx` (add `setFieldValue`, pass to `Composer`)
- Modify: `src/components/Composer.tsx` (props, imports, three editors, layout)

**Interfaces:**
- Consumes: `JsonEditor` from Task 1; `patch`/`AppState` already in App; `MONO`/styles already in Composer.
- Produces: `Composer` now requires a `setFieldValue: (field: keyof AppState) => (value: string) => void` prop.

- [ ] **Step 1: Add `setFieldValue` in `App.tsx` and pass it to `Composer`**

In `src/App.tsx`, immediately after the existing `setField` definition:
```tsx
  const setField =
    (field: keyof AppState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patch({ [field]: event.target.value } as Partial<AppState>);

  const setFieldValue =
    (field: keyof AppState) =>
    (value: string) =>
      patch({ [field]: value } as Partial<AppState>);
```

Then add the prop to the `<Composer ... />` element (alongside the existing `setField={setField}`):
```tsx
          <Composer
            state={state}
            setField={setField}
            setFieldValue={setFieldValue}
            setHeader={setHeader}
```
(Leave all other `Composer` props unchanged.)

- [ ] **Step 2: Update the `Composer` `Props` interface and imports**

In `src/components/Composer.tsx`, add the import at the top (with the other imports):
```tsx
import { JsonEditor } from "./JsonEditor";
```

Add the new prop to the `Props` interface, right after the existing `setField` member:
```tsx
  setField: (
    field: keyof AppState,
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setFieldValue: (field: keyof AppState) => (value: string) => void;
```

- [ ] **Step 3: Make the Composer content a full-height flex column**

In `src/components/Composer.tsx`, find the inner content container (the `<div>` directly inside the outer panel `<div>`):
```tsx
      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
        }}
      >
```
Replace its style with (adds `minHeight: "100%"` + `boxSizing`):
```tsx
      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
          minHeight: "100%",
          boxSizing: "border-box",
        }}
      >
```

- [ ] **Step 4: Replace the WebSocket payload textarea with a full-height `JsonEditor`**

Replace this block (the WS `Message payload` wrapper `<div>` and its `<textarea>`):
```tsx
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ font: "600 10px 'IBM Plex Sans'", letterSpacing: ".1em", textTransform: "uppercase", color: "#59616f" }}>
                  Message payload
                </label>
                <button onClick={props.wsSend} className="sb-brighten" style={accentBtn}>
                  Send ↵
                </button>
              </div>
              <textarea
                value={state.wsPayload}
                onChange={props.setField("wsPayload")}
                spellCheck={false}
                className="sb-input"
                style={{ ...textareaStyle, minHeight: "150px" }}
              />
            </div>
```
with:
```tsx
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ font: "600 10px 'IBM Plex Sans'", letterSpacing: ".1em", textTransform: "uppercase", color: "#59616f" }}>
                  Message payload
                </label>
                <button onClick={props.wsSend} className="sb-brighten" style={accentBtn}>
                  Send ↵
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor value={state.wsPayload} onChange={props.setFieldValue("wsPayload")} fillHeight />
              </div>
            </div>
```

- [ ] **Step 5: Replace the STOMP body textarea with a card-filling `JsonEditor`**

First, make the STOMP grid fill the panel: find the STOMP container:
```tsx
        {state.protocol === "stomp" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
```
Replace its style with:
```tsx
        {state.protocol === "stomp" && (
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
```

Then replace the body `<label>` + `<textarea>` at the bottom of the SEND card:
```tsx
              <label style={labelStyle}>Body</label>
              <textarea
                value={state.stompBody}
                onChange={props.setField("stompBody")}
                spellCheck={false}
                className="sb-input"
                style={{ ...textareaStyle, flex: 1, minHeight: "96px" }}
              />
```
with:
```tsx
              <label style={labelStyle}>Body</label>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor value={state.stompBody} onChange={props.setFieldValue("stompBody")} fillHeight />
              </div>
```

- [ ] **Step 6: Replace the RSocket data textarea with a full-height `JsonEditor`**

Find the RSocket `Data payload` wrapper `<div>` (the last block inside the rsocket branch) and its `<textarea>`:
```tsx
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
```
Change that opening wrapper `<div>` to flex-fill:
```tsx
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
```
Then replace the `<textarea>` inside it:
```tsx
              <textarea
                value={state.rsData}
                onChange={props.setField("rsData")}
                spellCheck={false}
                className="sb-input"
                style={{ ...textareaStyle, minHeight: "120px" }}
              />
```
with:
```tsx
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor value={state.rsData} onChange={props.setFieldValue("rsData")} fillHeight />
              </div>
```
(Leave the experimental-note `<div>` below it unchanged; it stays a fixed-height footnote under the editor.)

- [ ] **Step 7: Remove the now-unused `textareaStyle` if nothing references it**

After Steps 4–6, `textareaStyle` may be unused (all three textareas are gone). Run:
```bash
npm run build
```
If the build fails with `'textareaStyle' is declared but its value is never read` (TS6133 from `noUnusedLocals`), delete the `const textareaStyle: CSSProperties = { ... };` block in `Composer.tsx`. If the build passes, leave it. Re-run `npm run build` after deleting and confirm PASS.

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: use JSON editor for payload panels with full-height layout"
```

---

### Task 3: Memoize the heavy Results leaf components to remove typing lag

**Files:**
- Modify: `src/components/Results.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MessageCard` and `Metrics` become `React.memo`-wrapped (same props, same names).

- [ ] **Step 1: Import `memo`**

In `src/components/Results.tsx`, change the React import:
```tsx
import type { CSSProperties } from "react";
```
to:
```tsx
import { memo, type CSSProperties } from "react";
```

- [ ] **Step 2: Wrap `MessageCard` in `memo`**

Change:
```tsx
function MessageCard({ message }: { message: Message }) {
```
to:
```tsx
const MessageCard = memo(function MessageCard({ message }: { message: Message }) {
```
and change its closing brace `}` (the one that ends the `MessageCard` function, immediately before `function Metrics`) to:
```tsx
});
```

- [ ] **Step 3: Wrap `Metrics` in `memo`**

Change:
```tsx
function Metrics({ messages }: { messages: Message[] }) {
```
to:
```tsx
const Metrics = memo(function Metrics({ messages }: { messages: Message[] }) {
```
and change its closing brace `}` (the one that ends the `Metrics` function, immediately before `export function Results`) to:
```tsx
});
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS, zero TS errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "perf: memoize message cards and metrics to avoid re-render on payload edits"
```

---

### Task 4: Final verification and manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full clean build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Structure sanity check**

Run: Grep pattern `JsonEditor` path `src` → expect matches in `src/components/JsonEditor.tsx`, `src/components/Composer.tsx`.
Run: Grep pattern `<textarea` path `src/components/Composer.tsx` → expect no matches (all three replaced).

- [ ] **Step 3: Manual smoke in `npm run dev`** — confirm:
  - WebSocket: the message payload editor fills the whole remaining panel height; line numbers + JSON syntax highlighting + bracket matching show; typing is smooth even with many messages already in Results; `Send` transmits the current editor contents.
  - STOMP: the body editor fills its send card; subscribe/send still work and use the edited body.
  - RSocket: the data editor fills remaining height (with the experimental note beneath); request-response/stream/channel send the edited data.
  - Editor theme matches the dark UI (background, mono font, accent caret/selection).
  - Reload page — `wsPayload`/`stompBody`/`rsData` persist (form persistence unchanged).
  - Typing in a payload no longer lags (the core fix).

- [ ] **Step 4: Final commit** (only if any cleanup was made; otherwise skip)

```bash
git add -A
git commit -m "chore: finalize payload editor refinement"
```

---

## Self-Review Notes

- **Spec coverage:** dependencies (Task 1), reusable `JsonEditor` + theme (Task 1), full-height layout for all three editors (Task 2), `setFieldValue` wiring (Task 2 Steps 1–2), performance memoization (Task 3), verification + manual smoke (Task 4). All spec sections covered.
- **Type consistency:** `setFieldValue: (field: keyof AppState) => (value: string) => void` is defined identically in `App.tsx` (Task 2 Step 1) and the `Composer` `Props` (Task 2 Step 2); `JsonEditor` props match between Task 1 definition and Task 2 call sites (`value`, `onChange`, `fillHeight`).
- **No placeholders:** every code step shows complete code.
