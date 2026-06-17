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

export function useMessageLog(setState: Dispatch<SetStateAction<AppState>>) {
  const messageIdRef = useRef(0);

  const addMsg = useCallback(
    (entry: AddMsg) => {
      const raw = entry.raw == null ? "" : String(entry.raw);
      const parsed = util.tryParseJSON(raw);
      const message: Message = {
        id: ++messageIdRef.current,
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
      setState((prev) => ({ ...prev, messages: [message, ...prev.messages].slice(0, 1000) }));
    },
    [setState],
  );

  const err = useCallback(
    (message: string) => addMsg({ dir: "sys", kind: "err", raw: message }),
    [addMsg],
  );

  const clearMessages = useCallback(
    () => setState((prev) => ({ ...prev, messages: [] })),
    [setState],
  );

  return { messageIdRef, addMsg, err, clearMessages };
}
