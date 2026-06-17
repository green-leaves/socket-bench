import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { leaf } from "../lib/util";
import type { AppState } from "../state/appState";
import type { Collection } from "../types";

interface Deps {
  setState: Dispatch<SetStateAction<AppState>>;
  stateRef: MutableRefObject<AppState>;
  patch: (update: Partial<AppState>) => void;
  err: (message: string) => void;
}

export function useCollections({ setState, stateRef, patch, err }: Deps) {
  const defaultName = useCallback(() => {
    const snapshot = stateRef.current;
    if (snapshot.protocol === "stomp")
      return leaf(snapshot.stompSubDest) || leaf(snapshot.stompSendDest) || "subscription";
    if (snapshot.protocol === "rsocket") return (snapshot.rsRoute || "").trim() || "route";
    const leafName = leaf((snapshot.url || "").replace(/^wss?:\/\//, "").split("?")[0]);
    return leafName || "connection";
  }, [stateRef]);

  const saveCollection = useCallback(() => {
    const snapshot = stateRef.current;
    if (!snapshot.url.trim()) {
      err("Enter a URL to save.");
      return;
    }
    const suggested = defaultName();
    const name =
      typeof window !== "undefined" && window.prompt
        ? window.prompt("Name this connection", suggested)
        : suggested;
    if (name === null) return; // cancelled
    const finalName = (name || "").trim() || suggested;
    const item: Collection = {
      id: "c" + Date.now(),
      name: finalName,
      protocol: snapshot.protocol,
      url: snapshot.url,
      meta: { stompDest: snapshot.stompSubDest, rsRoute: snapshot.rsRoute, rsModel: snapshot.rsModel },
    };
    setState((prev) => ({ ...prev, collections: prev.collections.concat([item]) }));
  }, [defaultName, err, setState, stateRef]);

  const loadCollection = useCallback(
    (collection: Collection) => () => {
      const updates: Partial<AppState> = { protocol: collection.protocol, url: collection.url };
      if (collection.meta) {
        if (collection.protocol === "stomp" && collection.meta.stompDest)
          updates.stompSubDest = collection.meta.stompDest;
        if (collection.protocol === "rsocket") {
          if (collection.meta.rsRoute) updates.rsRoute = collection.meta.rsRoute;
          if (collection.meta.rsModel) updates.rsModel = collection.meta.rsModel;
        }
      }
      patch(updates);
    },
    [patch],
  );

  const deleteCollection = useCallback(
    (collection: Collection) => (event: React.MouseEvent) => {
      if (event && event.stopPropagation) event.stopPropagation();
      setState((prev) => ({
        ...prev,
        collections: prev.collections.filter((item) => item.id !== collection.id),
      }));
    },
    [setState],
  );

  return { saveCollection, loadCollection, deleteCollection };
}
