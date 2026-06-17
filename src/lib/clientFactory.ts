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
  addMsg: (m: AddMsg) => void;
  err: (msg: string) => void;
}

export function createClient(S: AppState, h: ClientHandlers): AnyClient {
  if (S.protocol === "ws") {
    return new WSClient({
      url: S.url,
      protocols: S.wsProtocols,
      onOpen: () => {
        h.onStatus("open", "Connected");
        h.addMsg({ dir: "sys", raw: "WebSocket open · " + S.url });
      },
      onMessage: (t, fmt) => h.addMsg({ dir: "in", raw: t, label: fmt }),
      onClose: (c, r) => {
        h.onStatus("closed", "Closed" + (c ? " (" + c + ")" : ""));
        h.addMsg({ dir: "sys", raw: "Closed" + (r ? ": " + r : "") + " · code " + c });
      },
      onError: (msg) => {
        h.onStatus("error", "Error");
        h.err(msg);
      },
    });
  }
  if (S.protocol === "stomp") {
    return new StompClient({
      url: S.url,
      connectHeaders: rowsToObj(S.stompConnectHeaders),
      onConnected: (hd) => {
        h.onStatus("open", "STOMP connected");
        h.addMsg({ dir: "sys", raw: "STOMP CONNECTED" + (hd.version ? " v" + hd.version : "") });
      },
      onMessage: (b, hd) =>
        h.addMsg({ dir: "in", raw: b, label: hd.destination || hd.subscription || "" }),
      onReceipt: (hd) => h.addMsg({ dir: "sys", raw: "RECEIPT " + (hd["receipt-id"] || "") }),
      onStompError: (b, hd) => {
        h.onStatus("error", "STOMP error");
        h.err((hd.message || "ERROR") + (b ? "\n" + b : ""));
      },
      onClose: (c) => {
        h.onStatus("closed", "Closed");
        h.addMsg({ dir: "sys", raw: "Closed · code " + c });
      },
      onError: (msg) => {
        h.onStatus("error", "Error");
        h.err(msg);
      },
    });
  }
  return new RSocketClient({
    url: S.url,
    onConnected: () => {
      h.onStatus("open", "RSocket ready");
      h.addMsg({
        dir: "sys",
        raw: "RSocket connected · SETUP sent (composite-metadata / application/json)",
      });
    },
    onClose: (c) => {
      h.onStatus("closed", "Closed");
      h.addMsg({ dir: "sys", raw: "Closed · code " + c });
    },
    onError: (msg) => {
      h.onStatus("error", "Error");
      h.err(msg);
    },
  });
}
