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
import { KEYS, read } from "../lib/storage";

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
  stompConnectHeaders: [{ k: "", v: "" }],
  stompSendHeaders: [{ k: "", v: "" }],
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
  const s: AppState = { ...DEFAULT_STATE };
  const c = read<Collection[]>(KEYS.collections);
  const h = read<HistoryItem[]>(KEYS.history);
  const f = read<Partial<AppState>>(KEYS.form);
  const set = read<Partial<Settings>>(KEYS.settings);
  if (Array.isArray(c)) s.collections = c;
  if (Array.isArray(h)) s.history = h;
  if (f && typeof f === "object") Object.assign(s, f);
  if (set && typeof set === "object") s.settings = { ...s.settings, ...set };
  return s;
}
