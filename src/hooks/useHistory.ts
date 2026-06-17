import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AppState } from "../state/appState";
import type { HistoryItem } from "../types";

export function useHistory(
  setS: Dispatch<SetStateAction<AppState>>,
  sRef: MutableRefObject<AppState>,
) {
  const pushHistory = useCallback(
    (action: string) => {
      const cur = sRef.current;
      const item: HistoryItem = {
        id: "h" + Date.now() + Math.random().toString(36).slice(2, 5),
        protocol: cur.protocol,
        url: cur.url,
        action,
        ts: Date.now(),
      };
      setS((prev) => ({ ...prev, history: [item, ...prev.history].slice(0, 40) }));
    },
    [setS, sRef],
  );

  const loadHistory = useCallback(
    (h: HistoryItem) => () =>
      setS((prev) => ({ ...prev, protocol: h.protocol, url: h.url })),
    [setS],
  );

  const clearHistory = useCallback(
    () => setS((prev) => ({ ...prev, history: [] })),
    [setS],
  );

  return { pushHistory, loadHistory, clearHistory };
}
