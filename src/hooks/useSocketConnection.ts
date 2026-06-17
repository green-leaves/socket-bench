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
  patch: (update: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  setState: Dispatch<SetStateAction<AppState>>;
  stateRef: MutableRefObject<AppState>;
  addMsg: (entry: AddMsg) => void;
  err: (message: string) => void;
  pushHistory: (action: string) => void;
  saveForm: () => void;
}

export function useSocketConnection(deps: Deps) {
  const { patch, setState, stateRef, addMsg, err, pushHistory, saveForm } = deps;
  const clientRef = useRef<AnyClient | null>(null);
  const sendTimesRef = useRef<Record<number, number>>({});
  const activeChannelRef = useRef<number | null>(null);

  const ready = useCallback(
    () => !!clientRef.current && clientRef.current.ready(),
    [],
  );

  const removeSub = useCallback(
    (key: string | number) =>
      setState((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.filter((sub) => sub.key !== key),
      })),
    [setState],
  );

  const addSubscription = useCallback(
    (sub: Subscription) =>
      setState((prev) => ({ ...prev, subscriptions: prev.subscriptions.concat([sub]) })),
    [setState],
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
    const snapshot = stateRef.current;
    if (!snapshot.url.trim()) {
      err("Enter an endpoint URL first.");
      return;
    }
    disconnect(true);
    patch({ status: "connecting", statusText: "Connecting…", latency: null, subscriptions: [] });
    pushHistory("connect");
    saveForm();
    clientRef.current = createClient(snapshot, {
      onStatus: (status, text) => patch({ status, statusText: text }),
      addMsg,
      err,
    });
    try {
      clientRef.current.connect();
    } catch (error) {
      patch({ status: "error", statusText: "Error" });
      err((error as Error).message);
    }
  }, [addMsg, disconnect, err, patch, pushHistory, saveForm, stateRef]);

  const wsSend = useCallback(() => {
    if (!ready()) {
      err("Not connected.");
      return;
    }
    try {
      const byteCount = (clientRef.current as WSClient).send(stateRef.current.wsPayload);
      addMsg({ dir: "out", raw: stateRef.current.wsPayload, size: byteCount });
      pushHistory("send");
    } catch (error) {
      err((error as Error).message);
    }
  }, [addMsg, err, pushHistory, ready, stateRef]);

  const stompSubscribe = useCallback(() => {
    if (!ready()) {
      err("Connect first (STOMP needs a CONNECTED frame).");
      return;
    }
    const destination = stateRef.current.stompSubDest.trim();
    if (!destination) return;
    const subscriptionId = (clientRef.current as StompClient).subscribe(destination);
    addSubscription({ key: subscriptionId, kind: "stomp", label: destination });
    addMsg({ dir: "out", raw: "SUBSCRIBE " + destination, label: destination });
  }, [addMsg, addSubscription, err, ready, stateRef]);

  const stompSend = useCallback(() => {
    if (!ready()) {
      err("Connect first.");
      return;
    }
    const snapshot = stateRef.current;
    const destination = snapshot.stompSendDest.trim();
    const byteCount = (clientRef.current as StompClient).send(
      destination,
      snapshot.stompBody,
      rowsToObj(snapshot.stompSendHeaders),
    );
    addMsg({ dir: "out", raw: snapshot.stompBody, label: destination, size: byteCount });
    pushHistory("send");
  }, [addMsg, err, pushHistory, ready, stateRef]);

  const rsRequest = useCallback(() => {
    if (!ready()) {
      err("Connect first (sends SETUP).");
      return;
    }
    const snapshot = stateRef.current;
    const client = clientRef.current as RSocketClient;
    const route = snapshot.rsRoute.trim();
    const data = snapshot.rsData;
    const initialRequestN = parseInt(snapshot.rsInitialN, 10) || 2147483647;
    if (snapshot.rsModel === "rr") {
      const response = client.requestResponse(route, data, {
        onPayload: (payload) => {
          const sentAt = sendTimesRef.current[response.streamId];
          const latency = sentAt != null ? Math.round(util.now() - sentAt) : null;
          addMsg({ dir: "in", raw: payload, label: route, latency });
          if (latency != null) patch({ latency });
        },
        onError: (code, message) => err("RSocket error " + code + ": " + message),
      });
      sendTimesRef.current[response.streamId] = util.now();
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-response", size: response.bytes });
    } else if (snapshot.rsModel === "stream") {
      const streamResult = client.requestStream(route, data, initialRequestN, {
        onPayload: (payload) => addMsg({ dir: "in", raw: payload, label: route }),
        onComplete: () => {
          removeSub(streamResult.streamId);
          addMsg({ dir: "sys", raw: "Stream complete · " + route });
        },
        onError: (code, message) => {
          removeSub(streamResult.streamId);
          err("RSocket error " + code + ": " + message);
        },
      });
      addSubscription({ key: streamResult.streamId, kind: "rsocket", label: route + " · stream" });
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-stream", size: streamResult.bytes });
    } else if (snapshot.rsModel === "channel") {
      const channelResult = client.requestChannel(route, data, initialRequestN, {
        onPayload: (payload) => addMsg({ dir: "in", raw: payload, label: route }),
        onComplete: () => {
          removeSub(channelResult.streamId);
          activeChannelRef.current = null;
          addMsg({ dir: "sys", raw: "Channel complete · " + route });
        },
        onError: (code, message) => {
          removeSub(channelResult.streamId);
          err("RSocket error " + code + ": " + message);
        },
      });
      activeChannelRef.current = channelResult.streamId;
      addSubscription({ key: channelResult.streamId, kind: "rsocket", label: route + " · channel" });
      addMsg({ dir: "out", raw: data, label: route + "  ·  request-channel (open)", size: channelResult.bytes });
    } else {
      const fireResult = client.fireAndForget(route, data);
      addMsg({ dir: "out", raw: data, label: route + "  ·  fire-and-forget", size: fireResult.bytes });
    }
    pushHistory("send");
  }, [addMsg, addSubscription, err, patch, pushHistory, ready, removeSub, stateRef]);

  const rsChannelPush = useCallback(() => {
    if (activeChannelRef.current == null) {
      err("No open channel — send a request-channel first.");
      return;
    }
    const byteCount = (clientRef.current as RSocketClient).sendPayload(
      activeChannelRef.current,
      stateRef.current.rsData,
      false,
    );
    addMsg({ dir: "out", raw: stateRef.current.rsData, label: "channel push", size: byteCount });
  }, [addMsg, err, stateRef]);

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
