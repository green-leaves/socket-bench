import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { KEYS, write } from "../lib/storage";
import type { AnyClient } from "../lib/clients";
import type { Collection, HistoryItem, Settings } from "../types";

interface Deps {
  collections: Collection[];
  history: HistoryItem[];
  settings: Settings;
  saveForm: () => void;
  clientRef: MutableRefObject<AnyClient | null>;
}

export function usePersistence({ collections, history, settings, saveForm, clientRef }: Deps) {
  useEffect(() => write(KEYS.collections, collections), [collections]);
  useEffect(() => write(KEYS.history, history), [history]);
  useEffect(() => write(KEYS.settings, settings), [settings]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveForm);
    return () => {
      saveForm();
      const client = clientRef.current;
      if (client)
        try {
          client.close();
        } catch {
          /* ignore */
        }
      window.removeEventListener("beforeunload", saveForm);
    };
  }, [saveForm, clientRef]);
}
