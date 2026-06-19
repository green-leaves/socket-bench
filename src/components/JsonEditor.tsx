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

/* Hoisted so their identity is stable across renders — passing fresh
   `extensions`/`basicSetup` on every keystroke makes CodeMirror tear down and
   reconfigure the editor each time, which is needless work while typing. */
const jsonExtensions = [json()];
const basicSetupConfig = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  bracketMatching: true,
  autocompletion: false,
} as const;

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** When true the editor fills its flex parent (height 100%, internal scroll). */
  fillHeight?: boolean;
  /** Fixed min height used when not fillHeight (e.g. "120px"). Ignored when fillHeight is true. */
  minHeight?: string;
}

export function JsonEditor({ value, onChange, fillHeight, minHeight }: JsonEditorProps) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={editorTheme}
      extensions={jsonExtensions}
      height={fillHeight ? "100%" : undefined}
      minHeight={fillHeight ? undefined : minHeight || "120px"}
      style={fillHeight ? { height: "100%" } : undefined}
      basicSetup={basicSetupConfig}
    />
  );
}
