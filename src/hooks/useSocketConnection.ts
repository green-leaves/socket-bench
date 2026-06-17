import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  type AnyClient,
  WSClient,
  StompClient,
  RSocketClient,
  util,
} from "../lib/clients";
import { rowsToObj } from "../lib/util";
import { createClient } from "../lib/clientFactory";
import { type AddMsg } from "./useMessageLog";
import type { AppState } from "../state/appState";
import type { Subscription } from "../types";

interface Deps {
  patch: (p: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  setS: Dispatch<SetStateAction<AppState>>;
  sRef: MutableRefObject<AppState>;
  addMsg: (m: AddMsg) => void;
  err: (msg: string) => void;
  pushHistory: (action: string) => void;
  saveForm: () => void;
}

export function useSocketConnection(deps: Deps) {
  const { patch, setS, sRef, addMsg, err, pushHistory, saveForm } = deps;
  const clientRef = useRef<AnyClient | null>(null);
  const sendTimesRef = useRef<Record<number, number>>({});
  const activeChannelRef = useRef<number | null>(null);

  const ready = useCallback(
    () => !!clientRef.current && clientRef.current.ready(),
    [],
  );

  const removeSub = useCallback(
    (key: string | number) =>
      setS((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.filter((x) => x.key !== key),
      })),
    [setS],
  );

  const addSubscription = useCallback(
    (sub: Subscription) =>
      setS((prev) => ({ ...prev, subscriptions: prev.subscriptions.concat([sub]) })),
    [setS],
  );

  const disconnect = useCallback(
    (silent?: boolean) => {
      if (clientRef.current) {
        try {
          clientRef.current.close();
        } catch {
          /* ignore */
        }
        clientRef.current = null;
      }
      activeChannelRef.current = null;
      if (silent !== true) {
        patch({ status: "closed", statusText: "Disconnected", subscriptions: [] });
        addMsg({ dir: "sys", raw: "Disconnected by user" });
      }
    },
    [addMsg, patch],
  );

  const connect = useCallback(() => {
    const S = sRef.current;
    if (!S.url.trim()) {
      err("Enter an endpoint URL first.");
      return;
    }
    disconnect(true);
    patch({ status: "connecting", statusText: "Connecting…", latency: null, subscriptions: [] });
    pushHistory("connect");
    saveForm();
    clientRef.current = createClient(S, {
      onStatus: (status, text) => patch({ status, statusText: text }),
      addMsg,
      err,
    });
    try {
      clientRef.current.connect();
    } catch (e) {
      patch({ status: "error", statusText: "Error" });
      err((e as Error).message);
    }
  }, [addMsg, disconnect, err, patch, pushHistory, saveForm, sRef]);

  const wsSend = useCallback(() => {
    if (!ready()) {
      err("Not connected.");
      return;
    }
    try {
      const n = (clientRef.current as WSClient).send(sRef.current.wsPayload);
      addMsg({ dir: "out", raw: sRef.current.wsPayload, size: n });
      pushHistory("send");
    } catch (e) {
      err((e as Error).message);
    }
  }, [addMsg, err, pushHistory, ready, sRef]);

  const stompSubscribe = useCallback(() => {
    if (!ready()) {
      err("Connect first (STOMP needs a CONNECTED frame).");
      return;
    }
    const dest = sRef.current.stompSubDest.trim();
    if (!dest) return;
    const id = (clientRef.current as StompClient).subscribe(dest);
    addSubscription({ key: id, kind: "stomp", label: dest });
    addMsg({ dir: "out", raw: "SUBSCRIBE " + dest, label: dest });
  }, [addMsg, addSubscription, err, ready, sRef]);

  const stompSend = useCallback(() => {
    if (!ready()) {
      err("Connect first.");
      return;
    }
    const cur = sRef.current;
    const dest = cur.stompSendDest.trim();
    const n = (clientRef.current as StompClient).send(
      dest,
      cur.stompBody,
      rowsToObj(cur.stompSendHeaders),
    );
    addMsg({ dir: "out", raw: cur.stompBody, label: dest, size: n });
    pushHistory("send");
  }, [addMsg, err, pushHistory, ready, sRef]);

  const rsRequest = useCallback(() => {
    if (!ready()) {
      err("Connect first (sends SETUP).");
      return;
    }
    const S = sRef.current;
    const client = clientRef.current as RSocketClient;
    const route = S.rsRoute.trim();
    const data = S.rsData;
    const initN = parseInt(S.rsInitialN, 10) || 2147483647;
    if (S.rsModel === "rr") {
      const r = client.requestResponse(route, data, {
        onPayload: (d) => {
          const t0 = sendTimesRef.current[r.streamId];
          const lat = t0 != null ? Math.round(util.now() - t0) : null;
          addMsg({ dir: "in", raw: d, label: route, latency: lat });
          if (lat != null) patch({ latency: lat });
        },
        onError: (c, m) => err("RSocket error " + c + ": " + m),
      });
      sendTimesRef.current[r.streamId] = util.now();
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-response", size: r.bytes });
    } else if (S.rsModel === "stream") {
      const r2 = client.requestStream(route, data, initN, {
        onPayload: (d) => addMsg({ dir: "in", raw: d, label: route }),
        onComplete: () => {
          removeSub(r2.streamId);
          addMsg({ dir: "sys", raw: "Stream complete · " + route });
        },
        onError: (c, m) => {
          removeSub(r2.streamId);
          err("RSocket error " + c + ": " + m);
        },
      });
      addSubscription({ key: r2.streamId, kind: "rsocket", label: route + " · stream" });
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-stream", size: r2.bytes });
    } else if (S.rsModel === "channel") {
      const r3 = client.requestChannel(route, data, initN, {
        onPayload: (d) => addMsg({ dir: "in", raw: d, label: route }),
        onComplete: () => {
          removeSub(r3.streamId);
          activeChannelRef.current = null;
          addMsg({ dir: "sys", raw: "Channel complete · " + route });
        },
        onError: (c, m) => {
          removeSub(r3.streamId);
          err("RSocket error " + c + ": " + m);
        },
      });
      activeChannelRef.current = r3.streamId;
      addSubscription({ key: r3.streamId, kind: "rsocket", label: route + " · channel" });
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-channel (open)", size: r3.bytes });
    } else {
      const r4 = client.fireAndForget(route, data);
      addMsg({ dir: "out", raw: data, label: route + "  ·  fire-and-forget", size: r4.bytes });
    }
    pushHistory("send");
  }, [addMsg, addSubscription, err, patch, pushHistory, ready, removeSub, sRef]);

  const rsChannelPush = useCallback(() => {
    if (activeChannelRef.current == null) {
      err("No open channel — send a request-channel first.");
      return;
    }
    const n = (clientRef.current as RSocketClient).sendPayload(
      activeChannelRef.current,
      sRef.current.rsData,
      false,
    );
    addMsg({ dir: "out", raw: sRef.current.rsData, label: "channel push", size: n });
  }, [addMsg, err, sRef]);

  const rsChannelComplete = useCallback(() => {
    if (activeChannelRef.current == null) return;
    (clientRef.current as RSocketClient).sendPayload(activeChannelRef.current, "", true);
    addMsg({ dir: "sys", raw: "Channel completed by client" });
  }, [addMsg]);

  const cancelSub = useCallback(
    (sub: Subscription) => () => {
      const client = clientRef.current;
      if (client) {
        if (sub.kind === "stomp") {
          try {
            (client as StompClient).unsubscribe(sub.key as string);
          } catch {
            /* ignore */
          }
        } else {
          try {
            (client as RSocketClient).cancel(sub.key as number);
          } catch {
            /* ignore */
          }
        }
      }
      if (sub.kind === "rsocket" && sub.key === activeChannelRef.current)
        activeChannelRef.current = null;
      removeSub(sub.key);
      addMsg({ dir: "sys", raw: "Cancelled · " + sub.label });
    },
    [addMsg, removeSub],
  );

  return {
    clientRef,
    connect,
    disconnect,
    ready,
    wsSend,
    stompSubscribe,
    stompSend,
    rsRequest,
    rsChannelPush,
    rsChannelComplete,
    cancelSub,
    removeSub,
  };
}
