import { useCallback, useRef, useState } from "react";
import { type AppState, loadInitialState } from "./appState";

export function useAppState() {
  const [s, setS] = useState<AppState>(loadInitialState);

  const patch = useCallback(
    (p: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) =>
      setS((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) })),
    [],
  );

  // live snapshot for socket-event closures + saveForm
  const sRef = useRef(s);
  sRef.current = s;

  return { s, setS, patch, sRef };
}
