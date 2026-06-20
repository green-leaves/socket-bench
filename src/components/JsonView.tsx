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
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let keyCounter = 0;
  const regex =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const push = (text: string, color: string | null) => {
    if (text)
      nodes.push(
        <span key={keyCounter++} style={color ? { color } : undefined}>
          {text}
        </span>,
      );
  };
  let match: RegExpExecArray | null;
  while ((match = regex.exec(pretty)) !== null) {
    push(pretty.slice(cursor, match.index), null);
    if (match[1] !== undefined) {
      if (match[2]) {
        push(match[1], "#58a6ff"); // key
        push(match[2], "#5a6270");
      } else {
        push(match[1], "#7ee0b5"); // string value
      }
    } else if (match[3] !== undefined) {
      push(match[3], "#d2a8ff"); // bool / null
    } else if (match[4] !== undefined) {
      push(match[4], "#f5c451"); // number
    }
    cursor = regex.lastIndex;
  }
  push(pretty.slice(cursor), null);
  return <pre style={preStyle}>{nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</pre>;
}

export function PlainView({ text }: { text: string }) {
  return <pre style={plainStyle}>{text}</pre>;
}
