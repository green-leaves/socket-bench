import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AppState } from "../state/appState";
import type { HistoryItem } from "../types";

export function useHistory(
  setState: Dispatch<SetStateAction<AppState>>,
  stateRef: MutableRefObject<AppState>,
) {
  const pushHistory = useCallback(
    (action: string) => {
      const snapshot = stateRef.current;
      const item: HistoryItem = {
        id: "h" + Date.now() + Math.random().toString(36).slice(2, 5),
        protocol: snapshot.protocol,
        url: snapshot.url,
        action,
        ts: Date.now(),
      };
      setState((prev) => ({ ...prev, history: [item, ...prev.history].slice(0, 40) }));
    },
    [setState, stateRef],
  );

  const loadHistory = useCallback(
    (entry: HistoryItem) => () =>
      setState((prev) => ({ ...prev, protocol: entry.protocol, url: entry.url })),
    [setState],
  );

  const clearHistory = useCallback(
    () => setState((prev) => ({ ...prev, history: [] })),
    [setState],
  );

  return { pushHistory, loadHistory, clearHistory };
}
