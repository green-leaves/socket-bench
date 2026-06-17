import { useCallback, useRef, useState } from "react";
import { type AppState, loadInitialState } from "./appState";

export function useAppState() {
  const [state, setState] = useState<AppState>(loadInitialState);

  const patch = useCallback(
    (update: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) =>
      setState((prev) => ({ ...prev, ...(typeof update === "function" ? update(prev) : update) })),
    [],
  );

  // live snapshot for socket-event closures + saveForm
  const stateRef = useRef(state);
  stateRef.current = state;

  return { state, setState, patch, stateRef };
}
