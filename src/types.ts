export type Protocol = "ws" | "stomp" | "rsocket" | "fix";
export type Direction = "in" | "out" | "sys";
export type MsgKind = "msg" | "sys" | "err";
export type RsModel = "stream" | "rr" | "channel" | "fnf";
export type FilterDir = "all" | "in" | "out" | "sys";
export type Status = "idle" | "connecting" | "open" | "closed" | "error";
export type Density = "comfortable" | "compact";

export interface Message {
  id: number;
  dir: Direction;
  kind: MsgKind;
  ts: number;
  label: string;
  size: number;
  raw: string;
  pretty: string;
  isJson: boolean;
  latency?: number | null;
}

export interface Subscription {
  key: string | number;
  kind: "stomp" | "rsocket";
  label: string;
}

export interface CollectionMeta {
  stompDest?: string;
  rsRoute?: string;
  rsModel?: RsModel;
}

export interface Collection {
  id: string;
  name: string;
  protocol: Protocol;
  url: string;
  meta?: CollectionMeta;
}

export interface HeaderRow {
  key: string;
  value: string;
}

/** Settings exposed through the top-right tweaks panel (design props). */
export interface Settings {
  accent: string;
  density: Density;
}
