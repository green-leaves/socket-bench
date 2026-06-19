import type {
  Collection,
  HeaderRow,
  Message,
  Protocol,
  RsModel,
  Settings,
  Status,
  Subscription,
} from "../types";
import { leaf } from "../lib/util";

/** Shape accepted by addMsg/err handlers (shared by the connection manager). */
export type AddMsg = {
  dir?: Message["dir"];
  kind?: Message["kind"];
  raw?: unknown;
  label?: string;
  size?: number;
  latency?: number | null;
};

export interface Endpoint {
  id: string;
  name: string; // user label; "" => derive from URL for display
  // --- config (persisted) ---
  protocol: Protocol;
  url: string;
  wsPayload: string;
  wsProtocols: string;
  stompSubDest: string;
  stompSendDest: string;
  stompBody: string;
  stompConnectHeaders: HeaderRow[];
  stompSendHeaders: HeaderRow[];
  rsModel: RsModel;
  rsRoute: string;
  rsData: string;
  rsInitialN: string;
  // --- runtime (NOT persisted; reset on load) ---
  status: Status;
  statusText: string;
  latency: number | null;
  messages: Message[];
  subscriptions: Subscription[];
  resultTab: "messages" | "raw" | "metrics";
  filterText: string;
  filterDir: "all" | "in" | "out" | "sys";
}

export interface WorkspaceState {
  endpoints: Endpoint[];
  activeEndpointId: string | null;
  splitW: number;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { accent: "#d4662b", density: "comfortable" };

/** Config fields persisted per endpoint (excludes all runtime fields). */
export const ENDPOINT_CONFIG_KEYS: (keyof Endpoint)[] = [
  "id",
  "name",
  "protocol",
  "url",
  "wsPayload",
  "wsProtocols",
  "stompSubDest",
  "stompSendDest",
  "stompBody",
  "stompConnectHeaders",
  "stompSendHeaders",
  "rsModel",
  "rsRoute",
  "rsData",
  "rsInitialN",
];

export function newEndpointId(): string {
  return "e" + Date.now() + Math.random().toString(36).slice(2, 5);
}

export function DEFAULT_ENDPOINT(id: string = newEndpointId()): Endpoint {
  return {
    id,
    name: "",
    protocol: "ws",
    url: "",
    wsPayload: '{\n  "hello": "world"\n}',
    wsProtocols: "",
    stompSubDest: "/topic/messages",
    stompSendDest: "/app/hello",
    stompBody: '{\n  "name": "QA"\n}',
    stompConnectHeaders: [{ key: "", value: "" }],
    stompSendHeaders: [{ key: "", value: "" }],
    rsModel: "stream",
    rsRoute: "greeting",
    rsData: '{\n  "name": "QA"\n}',
    rsInitialN: "2147483647",
    status: "idle",
    statusText: "Not connected",
    latency: null,
    messages: [],
    subscriptions: [],
    resultTab: "messages",
    filterText: "",
    filterDir: "all",
  };
}

/** One-time migration: legacy saved Collection -> Endpoint. */
export function endpointFromCollection(collection: Collection): Endpoint {
  const endpoint = DEFAULT_ENDPOINT();
  endpoint.name = collection.name || "";
  endpoint.protocol = collection.protocol;
  endpoint.url = collection.url;
  if (collection.meta) {
    if (collection.meta.stompDest) endpoint.stompSubDest = collection.meta.stompDest;
    if (collection.meta.rsRoute) endpoint.rsRoute = collection.meta.rsRoute;
    if (collection.meta.rsModel) endpoint.rsModel = collection.meta.rsModel;
  }
  return endpoint;
}

/** Sidebar label: explicit name, else the URL's last path segment, else "Untitled". */
export function endpointDisplayName(endpoint: Endpoint): string {
  if (endpoint.name.trim()) return endpoint.name.trim();
  const fromUrl = leaf((endpoint.url || "").replace(/^wss?:\/\//, "").split("?")[0]);
  return fromUrl || "Untitled";
}
