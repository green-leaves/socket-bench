import {
  WSClient,
  StompClient,
  RSocketClient,
  type AnyClient,
} from "./clients";
import { rowsToObj } from "./util";
import type { AppState } from "../state/appState";
import type { Status } from "../types";
import type { AddMsg } from "../hooks/useMessageLog";

export interface ClientHandlers {
  onStatus: (status: Status, text: string) => void;
  addMsg: (entry: AddMsg) => void;
  err: (msg: string) => void;
}

export function createClient(appState: AppState, handlers: ClientHandlers): AnyClient {
  if (appState.protocol === "ws") {
    return new WSClient({
      url: appState.url,
      protocols: appState.wsProtocols,
      onOpen: () => {
        handlers.onStatus("open", "Connected");
        handlers.addMsg({ dir: "sys", raw: "WebSocket open · " + appState.url });
      },
      onMessage: (text, format) => handlers.addMsg({ dir: "in", raw: text, label: format }),
      onClose: (code, reason) => {
        handlers.onStatus("closed", "Closed" + (code ? " (" + code + ")" : ""));
        handlers.addMsg({ dir: "sys", raw: "Closed" + (reason ? ": " + reason : "") + " · code " + code });
      },
      onError: (message) => {
        handlers.onStatus("error", "Error");
        handlers.err(message);
      },
    });
  }
  if (appState.protocol === "stomp") {
    return new StompClient({
      url: appState.url,
      connectHeaders: rowsToObj(appState.stompConnectHeaders),
      onConnected: (frameHeaders) => {
        handlers.onStatus("open", "STOMP connected");
        handlers.addMsg({ dir: "sys", raw: "STOMP CONNECTED" + (frameHeaders.version ? " v" + frameHeaders.version : "") });
      },
      onMessage: (body, frameHeaders) =>
        handlers.addMsg({ dir: "in", raw: body, label: frameHeaders.destination || frameHeaders.subscription || "" }),
      onReceipt: (frameHeaders) => handlers.addMsg({ dir: "sys", raw: "RECEIPT " + (frameHeaders["receipt-id"] || "") }),
      onStompError: (body, frameHeaders) => {
        handlers.onStatus("error", "STOMP error");
        handlers.err((frameHeaders.message || "ERROR") + (body ? "\n" + body : ""));
      },
      onClose: (code) => {
        handlers.onStatus("closed", "Closed");
        handlers.addMsg({ dir: "sys", raw: "Closed · code " + code });
      },
      onError: (message) => {
        handlers.onStatus("error", "Error");
        handlers.err(message);
      },
    });
  }
  return new RSocketClient({
    url: appState.url,
    onConnected: () => {
      handlers.onStatus("open", "RSocket ready");
      handlers.addMsg({
        dir: "sys",
        raw: "RSocket connected · SETUP sent (composite-metadata / application/json)",
      });
    },
    onClose: (code) => {
      handlers.onStatus("closed", "Closed");
      handlers.addMsg({ dir: "sys", raw: "Closed · code " + code });
    },
    onError: (message) => {
      handlers.onStatus("error", "Error");
      handlers.err(message);
    },
  });
}
