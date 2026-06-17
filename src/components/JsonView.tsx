import { Fragment, type ReactNode } from "react";
import { MONO } from "../styles";

const preStyle = {
  margin: 0,
  font: "12.5px/1.55 " + MONO,
  color: "#8a93a4",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  overflowX: "auto" as const,
};

const plainStyle = { ...preStyle, color: "#cdd6e0" };

/** Syntax-highlight pretty-printed JSON. Colors match the design:
 *  keys blue, strings green, numbers amber, bool/null purple, punctuation dim. */
export function JsonView({ pretty }: { pretty: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;
  const push = (txt: string, color: string | null) => {
    if (txt)
      out.push(
        <span key={key++} style={color ? { color } : undefined}>
          {txt}
        </span>,
      );
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(pretty)) !== null) {
    push(pretty.slice(last, m.index), null);
    if (m[1] !== undefined) {
      if (m[2]) {
        push(m[1], "#58a6ff"); // key
        push(m[2], "#5a6270");
      } else {
        push(m[1], "#7ee0b5"); // string value
      }
    } else if (m[3] !== undefined) {
      push(m[3], "#d2a8ff"); // bool / null
    } else if (m[4] !== undefined) {
      push(m[4], "#f5c451"); // number
    }
    last = re.lastIndex;
  }
  push(pretty.slice(last), null);
  return <pre style={preStyle}>{out.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</pre>;
}

export function PlainView({ text }: { text: string }) {
  return <pre style={plainStyle}>{text}</pre>;
}
