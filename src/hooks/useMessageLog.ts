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
