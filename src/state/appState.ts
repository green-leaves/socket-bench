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
  const savedCollections = read<Collection[]>(KEYS.collections);
  const savedHistory = read<HistoryItem[]>(KEYS.history);
  const savedForm = read<Partial<AppState>>(KEYS.form);
  const savedSettings = read<Partial<Settings>>(KEYS.settings);
  if (Array.isArray(savedCollections)) state.collections = savedCollections;
  if (Array.isArray(savedHistory)) state.history = savedHistory;
  if (savedForm && typeof savedForm === "object") Object.assign(state, savedForm);
  if (savedSettings && typeof savedSettings === "object")
    state.settings = { ...state.settings, ...savedSettings };
  return state;
}
