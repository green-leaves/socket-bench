import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  type AnyClient,
  WSClient,
  StompClient,
  RSocketClient,
  FIXClient,
  prettyFrame,
  byteLen,
  util,
} from "../lib/clients";
import { rowsToObj } from "../lib/util";
import { render } from "../lib/templating";
import { createClient } from "../lib/clientFactory";
import { type AddMsg, type Endpoint, type WorkspaceState } from "../state/endpoint";
import type { Message, Subscription } from "../types";

interface Deps {
  stateRef: MutableRefObject<WorkspaceState>;
  updateEndpoint: (id: string, fn: (e: Endpoint) => Endpoint) => void;
  patchEndpoint: (id: string, partial: Partial<Endpoint>) => void;
  saveEndpoints: () => void;
}

export function useConnections(deps: Deps) {
  const { stateRef, updateEndpoint, patchEndpoint, saveEndpoints } = deps;
  const clientsRef = useRef<Map<string, AnyClient>>(new Map());
  const sendTimesRef = useRef<Map<string, Record<number, number>>>(new Map());
  const activeChannelRef = useRef<Map<string, number | null>>(new Map());

  const endpointOf = useCallback(
    (id: string) => stateRef.current.endpoints.find((e) => e.id === id),
    [stateRef],
  );

  const msgIdRef = useRef(0);
  const addMsg = useCallback(
    (id: string, entry: AddMsg) => {
      const raw = entry.raw == null ? "" : String(entry.raw);
      const parsed = util.tryParseJSON(raw);
      const message: Message = {
        id: ++msgIdRef.current,
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
      updateEndpoint(id, (e) => ({ ...e, messages: [message, ...e.messages].slice(0, 1000) }));
    },
    [updateEndpoint],
  );

  const err = useCallback(
    (id: string, message: string) => addMsg(id, { dir: "sys", kind: "err", raw: message }),
    [addMsg],
  );

  const clearMessages = useCallback(
    (id: string) => updateEndpoint(id, (e) => ({ ...e, messages: [] })),
    [updateEndpoint],
  );

  const ready = useCallback((id: string) => {
    const client = clientsRef.current.get(id);
    return !!client && client.ready();
  }, []);

  const removeSub = useCallback(
    (id: string, key: string | number) =>
      updateEndpoint(id, (e) => ({
        ...e,
        subscriptions: e.subscriptions.filter((s) => s.key !== key),
      })),
    [updateEndpoint],
  );

  const addSubscription = useCallback(
    (id: string, sub: Subscription) =>
      updateEndpoint(id, (e) => ({ ...e, subscriptions: e.subscriptions.concat([sub]) })),
    [updateEndpoint],
  );

  const disconnect = useCallback(
    (id: string, silent?: boolean) => {
      const client = clientsRef.current.get(id);
      if (client) {
        try {
          client.close();
        } catch {
          /* ignore */
        }
        clientsRef.current.delete(id);
      }
      activeChannelRef.current.set(id, null);
      if (silent !== true) {
        patchEndpoint(id, { status: "closed", statusText: "Disconnected", subscriptions: [] });
        addMsg(id, { dir: "sys", raw: "Disconnected by user" });
      }
    },
    [addMsg, patchEndpoint],
  );

  const connect = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (endpoint.protocol === "fix") {
        if (!endpoint.fixGatewayUrl.trim() || !endpoint.fixHost.trim() || !endpoint.fixPort.trim()) {
          err(id, "Set the gateway URL, acceptor host and port first.");
          return;
        }
      } else if (!endpoint.url.trim()) {
        err(id, "Enter an endpoint URL first.");
        return;
      }
      disconnect(id, true);
      patchEndpoint(id, {
        status: "connecting",
        statusText: "Connecting…",
        latency: null,
        subscriptions: [],
      });
      saveEndpoints();
      const client = createClient(endpoint, {
        onStatus: (status, text) => patchEndpoint(id, { status, statusText: text }),
        addMsg: (entry) => addMsg(id, entry),
        err: (message) => err(id, message),
      });
      clientsRef.current.set(id, client);
      try {
        client.connect();
      } catch (error) {
        patchEndpoint(id, { status: "error", statusText: "Error" });
        err(id, (error as Error).message);
      }
    },
    [addMsg, disconnect, endpointOf, err, patchEndpoint, saveEndpoints],
  );

  const wsSend = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Not connected.");
        return;
      }
      try {
        const payload = render(endpoint.wsPayload);
        const byteCount = (clientsRef.current.get(id) as WSClient).send(payload);
        addMsg(id, { dir: "out", raw: payload, size: byteCount });
      } catch (error) {
        err(id, (error as Error).message);
      }
    },
    [addMsg, endpointOf, err, ready],
  );

  const fixSend = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Not logged on.");
        return;
      }
      try {
        const raw = render(endpoint.fixMessage);
        const frame = (clientsRef.current.get(id) as FIXClient).send(raw);
        addMsg(id, { dir: "out", raw: prettyFrame(frame), label: "sent", size: byteLen(frame) });
      } catch (error) {
        err(id, (error as Error).message);
      }
    },
    [addMsg, endpointOf, err, ready],
  );

  const stompSubscribe = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Connect first (STOMP needs a CONNECTED frame).");
        return;
      }
      const destination = endpoint.stompSubDest.trim();
      if (!destination) return;
      const subscriptionId = (clientsRef.current.get(id) as StompClient).subscribe(destination);
      addSubscription(id, { key: subscriptionId, kind: "stomp", label: destination });
      addMsg(id, { dir: "out", raw: "SUBSCRIBE " + destination, label: destination });
    },
    [addMsg, addSubscription, endpointOf, err, ready],
  );

  const stompSend = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Connect first.");
        return;
      }
      const destination = endpoint.stompSendDest.trim();
      const body = render(endpoint.stompBody);
      const byteCount = (clientsRef.current.get(id) as StompClient).send(
        destination,
        body,
        rowsToObj(endpoint.stompSendHeaders),
      );
      addMsg(id, { dir: "out", raw: body, label: destination, size: byteCount });
    },
    [addMsg, endpointOf, err, ready],
  );

  const rsRequest = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      if (!ready(id)) {
        err(id, "Connect first (sends SETUP).");
        return;
      }
      const client = clientsRef.current.get(id) as RSocketClient;
      const route = endpoint.rsRoute.trim();
      const data = render(endpoint.rsData);
      const initialRequestN = parseInt(endpoint.rsInitialN, 10) || 2147483647;
      const sendTimes = sendTimesRef.current.get(id) ?? {};
      sendTimesRef.current.set(id, sendTimes);
      if (endpoint.rsModel === "rr") {
        const response = client.requestResponse(route, data, {
          onPayload: (payload) => {
            const sentAt = sendTimes[response.streamId];
            const latency = sentAt != null ? Math.round(util.now() - sentAt) : null;
            addMsg(id, { dir: "in", raw: payload, label: route, latency });
            if (latency != null) patchEndpoint(id, { latency });
          },
          onError: (code, message) => err(id, "RSocket error " + code + ": " + message),
        });
        sendTimes[response.streamId] = util.now();
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  request-response", size: response.bytes });
      } else if (endpoint.rsModel === "stream") {
        const streamResult = client.requestStream(route, data, initialRequestN, {
          onPayload: (payload) => addMsg(id, { dir: "in", raw: payload, label: route }),
          onComplete: () => {
            removeSub(id, streamResult.streamId);
            addMsg(id, { dir: "sys", raw: "Stream complete · " + route });
          },
          onError: (code, message) => {
            removeSub(id, streamResult.streamId);
            err(id, "RSocket error " + code + ": " + message);
          },
        });
        addSubscription(id, { key: streamResult.streamId, kind: "rsocket", label: route + " · stream" });
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  request-stream", size: streamResult.bytes });
      } else if (endpoint.rsModel === "channel") {
        const channelResult = client.requestChannel(route, data, initialRequestN, {
          onPayload: (payload) => addMsg(id, { dir: "in", raw: payload, label: route }),
          onComplete: () => {
            removeSub(id, channelResult.streamId);
            activeChannelRef.current.set(id, null);
            addMsg(id, { dir: "sys", raw: "Channel complete · " + route });
          },
          onError: (code, message) => {
            removeSub(id, channelResult.streamId);
            err(id, "RSocket error " + code + ": " + message);
          },
        });
        activeChannelRef.current.set(id, channelResult.streamId);
        addSubscription(id, { key: channelResult.streamId, kind: "rsocket", label: route + " · channel" });
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  request-channel (open)", size: channelResult.bytes });
      } else {
        const fireResult = client.fireAndForget(route, data);
        addMsg(id, { dir: "out", raw: data, label: route + "  ·  fire-and-forget", size: fireResult.bytes });
      }
    },
    [addMsg, addSubscription, endpointOf, err, patchEndpoint, ready, removeSub],
  );

  const rsChannelPush = useCallback(
    (id: string) => {
      const endpoint = endpointOf(id);
      if (!endpoint) return;
      const channel = activeChannelRef.current.get(id);
      if (channel == null) {
        err(id, "No open channel — send a request-channel first.");
        return;
      }
      const data = render(endpoint.rsData);
      const byteCount = (clientsRef.current.get(id) as RSocketClient).sendPayload(
        channel,
        data,
        false,
      );
      addMsg(id, { dir: "out", raw: data, label: "channel push", size: byteCount });
    },
    [addMsg, endpointOf, err],
  );

  const rsChannelComplete = useCallback(
    (id: string) => {
      const channel = activeChannelRef.current.get(id);
      if (channel == null) return;
      (clientsRef.current.get(id) as RSocketClient).sendPayload(channel, "", true);
      addMsg(id, { dir: "sys", raw: "Channel completed by client" });
    },
    [addMsg],
  );

  const cancelSub = useCallback(
    (id: string, sub: Subscription) => () => {
      const client = clientsRef.current.get(id);
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
      if (sub.kind === "rsocket" && sub.key === activeChannelRef.current.get(id))
        activeChannelRef.current.set(id, null);
      removeSub(id, sub.key);
      addMsg(id, { dir: "sys", raw: "Cancelled · " + sub.label });
    },
    [addMsg, removeSub],
  );

  const closeAll = useCallback(() => {
    clientsRef.current.forEach((client) => {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    });
    clientsRef.current.clear();
    activeChannelRef.current.clear();
  }, []);

  return {
    clientsRef,
    connect,
    disconnect,
    ready,
    wsSend,
    fixSend,
    stompSubscribe,
    stompSend,
    rsRequest,
    rsChannelPush,
    rsChannelComplete,
    cancelSub,
    removeSub,
    clearMessages,
    closeAll,
  };
}
