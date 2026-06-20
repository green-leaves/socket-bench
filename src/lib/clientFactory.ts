import {
  WSClient,
  StompClient,
  RSocketClient,
  FIXClient,
  prettyFrame,
  getField,
  byteLen,
  type AnyClient,
} from "./clients";
import { rowsToObj } from "./util";
import type { HeaderRow, Protocol, Status } from "../types";
import type { AddMsg } from "../state/endpoint";

export interface ClientConfig {
  protocol: Protocol;
  url: string;
  wsProtocols: string;
  stompConnectHeaders: HeaderRow[];
  fixGatewayUrl: string;
  fixHost: string;
  fixPort: string;
  fixTls: boolean;
  fixBeginString: string;
  fixSenderCompID: string;
  fixTargetCompID: string;
  fixHeartBtInt: string;
  fixResetSeq: boolean;
  fixUsername: string;
  fixPassword: string;
}

const FIX_SESSION_LABELS: Record<string, string> = {
  "0": "Heartbeat",
  "1": "TestRequest",
  "2": "ResendRequest",
  "3": "Reject",
  "4": "SequenceReset",
  "5": "Logout",
  A: "Logon",
};

function buildGatewayUrl(config: ClientConfig): string {
  const base = config.fixGatewayUrl.replace(/\/+$/, "");
  return (
    `${base}/?host=${encodeURIComponent(config.fixHost)}` +
    `&port=${encodeURIComponent(config.fixPort)}&tls=${config.fixTls ? "1" : "0"}`
  );
}

export interface ClientHandlers {
  onStatus: (status: Status, text: string) => void;
  addMsg: (entry: AddMsg) => void;
  err: (msg: string) => void;
}

export function createClient(appState: ClientConfig, handlers: ClientHandlers): AnyClient {
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

  if (appState.protocol === "fix") {
    return new FIXClient({
      url: buildGatewayUrl(appState),
      session: {
        beginString: appState.fixBeginString,
        senderCompID: appState.fixSenderCompID,
        targetCompID: appState.fixTargetCompID,
        heartBtInt: Number(appState.fixHeartBtInt) || 30,
        resetSeqNum: appState.fixResetSeq,
        username: appState.fixUsername || undefined,
        password: appState.fixPassword || undefined,
      },
      onLogon: () => {
        handlers.onStatus("open", "FIX logged on");
        handlers.addMsg({ dir: "sys", raw: "Logon ack received" });
      },
      onLogout: (text) =>
        handlers.addMsg({ dir: "sys", raw: "Logout" + (text ? ": " + text : "") }),
      onMessage: (frame, fields) =>
        handlers.addMsg({
          dir: "in",
          raw: prettyFrame(frame),
          label: getField(fields, 35) || "",
          size: byteLen(frame),
        }),
      onSession: (msgType, frame) =>
        handlers.addMsg({
          dir: "sys",
          raw: prettyFrame(frame),
          label: FIX_SESSION_LABELS[msgType] || "MsgType " + msgType,
        }),
      onGap: (expected, received) =>
        handlers.addMsg({
          dir: "sys",
          kind: "err",
          raw: `Sequence gap: expected ${expected}, received ${received}`,
        }),
      onClose: () => {
        handlers.onStatus("closed", "Closed");
        handlers.addMsg({ dir: "sys", raw: "Disconnected" });
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
