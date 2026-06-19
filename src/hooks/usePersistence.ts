import { useEffect } from "react";
import { KEYS, write } from "../lib/storage";
import type { Settings } from "../types";

interface Deps {
  settings: Settings;
  saveEndpoints: () => void;
  closeAll: () => void;
}

export function usePersistence({ settings, saveEndpoints, closeAll }: Deps) {
  useEffect(() => write(KEYS.settings, settings), [settings]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveEndpoints);
    return () => {
      saveEndpoints();
      closeAll();
      window.removeEventListener("beforeunload", saveEndpoints);
    };
  }, [saveEndpoints, closeAll]);
}
