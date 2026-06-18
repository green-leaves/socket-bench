import type {
  Collection,
  HeaderRow,
  HistoryItem,
  Message,
  Protocol,
  RsModel,
  Settings,
  Status,
  Subscription,
} from "../types";
import { KEYS, readAll } from "../lib/storage";

export interface AppState {
  protocol: Protocol;
  url: string;
  status: Status;
  statusText: string;
  latency: number | null;
  messages: Message[];
  subscriptions: Subscription[];
  collections: Collection[];
  history: HistoryItem[];
  resultTab: "messages" | "raw" | "metrics";
  sidebarTab: "collections" | "history";
  filterText: string;
  filterDir: "all" | "in" | "out" | "sys";
  splitW: number;
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
  settings: Settings;
}

export const DEFAULT_STATE: AppState = {
  protocol: "ws",
  url: "",
  status: "idle",
  statusText: "Not connected",
  latency: null,
  messages: [],
  subscriptions: [],
  collections: [],
  history: [],
  resultTab: "messages",
  sidebarTab: "collections",
  filterText: "",
  filterDir: "all",
  splitW: 480,
  wsPayload: '{\n  "hello": "world"\n}',
  wsProtocols: "",
  stompSubDest: "/topic/messages",
  stompSendDest: "/app/hello",
  stompBody: '{\n  "name": "QA"\n}',
  stompConnectHeaders: [{ key: "", value: "" }],
  stompSendHeaders: [{ key: "", value: "" }],
  rsModel: "rr",
  rsRoute: "greeting",
  rsData: '{\n  "name": "QA"\n}',
  rsInitialN: "2147483647",
  settings: { accent: "#d4662b", density: "comfortable" },
};

export const FORM_KEYS: (keyof AppState)[] = [
  "protocol",
  "url",
  "wsPayload",
  "wsProtocols",
  "stompSubDest",
  "stompSendDest",
  "stompBody",
  "rsModel",
  "rsRoute",
  "rsData",
  "rsInitialN",
];

export function loadInitialState(): AppState {
  const state: AppState = { ...DEFAULT_STATE };
  // All-or-nothing: a single corrupt key falls back to pure defaults (matches
  // the original loading semantics — one outer try/catch over all four reads).
  const stored = readAll(KEYS);
  if (!stored) return state;
  const { collections, history, form, settings } = stored;
  if (Array.isArray(collections)) state.collections = collections as Collection[];
  if (Array.isArray(history)) state.history = history as HistoryItem[];
  if (form && typeof form === "object") Object.assign(state, form as Partial<AppState>);
  if (settings && typeof settings === "object")
    state.settings = { ...state.settings, ...(settings as Partial<Settings>) };
  return state;
}
