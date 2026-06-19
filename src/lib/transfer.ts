/* transfer.ts — serialize/parse SocketBench endpoints to a portable JSON file.
   localStorage stays the live store; these files are the durable backup/share
   layer (Export/Import). Endpoints are carried as config only (no runtime state). */
import {
  type Endpoint,
  newEndpointId,
  rehydrate,
  toEndpointConfig,
} from "../state/endpoint";
import type { Settings } from "../types";

const APP_TAG = "socketbench";
const FORMAT_VERSION = 1;

export interface WorkspaceFile {
  app: typeof APP_TAG;
  kind: "workspace";
  version: number;
  exportedAt: string;
  endpoints: Record<string, unknown>[];
  settings: Settings;
}

export interface EndpointFile {
  app: typeof APP_TAG;
  kind: "endpoint";
  version: number;
  exportedAt: string;
  endpoint: Record<string, unknown>;
}

/** Whole workspace -> a single exportable file (all endpoints + settings). */
export function serializeWorkspace(endpoints: Endpoint[], settings: Settings): WorkspaceFile {
  return {
    app: APP_TAG,
    kind: "workspace",
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    endpoints: endpoints.map(toEndpointConfig),
    settings,
  };
}

/** One endpoint -> a single exportable file. */
export function serializeEndpoint(endpoint: Endpoint): EndpointFile {
  return {
    app: APP_TAG,
    kind: "endpoint",
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    endpoint: toEndpointConfig(endpoint),
  };
}

/**
 * Parse a previously exported file (workspace or single endpoint) into
 * ready-to-add Endpoints. Each endpoint is rehydrated with a FRESH id, so an
 * import is always additive and can never overwrite an existing endpoint.
 * Throws with a user-facing message on an unrecognized shape.
 */
export function parseImport(data: unknown): Endpoint[] {
  if (!data || typeof data !== "object") throw new Error("Not a valid SocketBench export.");
  const file = data as Record<string, unknown>;
  if (file.app !== APP_TAG) throw new Error("Not a valid SocketBench export.");

  let configs: unknown[];
  if (file.kind === "workspace") {
    if (!Array.isArray(file.endpoints)) throw new Error("Workspace file has no endpoints.");
    configs = file.endpoints;
  } else if (file.kind === "endpoint") {
    if (!file.endpoint || typeof file.endpoint !== "object")
      throw new Error("Endpoint file has no endpoint.");
    configs = [file.endpoint];
  } else {
    throw new Error("Unrecognized SocketBench file kind.");
  }

  return configs.map((config) => {
    const endpoint = rehydrate(config as Partial<Endpoint>);
    endpoint.id = newEndpointId();
    return endpoint;
  });
}

/** "Prod STOMP!" -> "prod-stomp"; blank -> "endpoint" (for filenames). */
export function slug(name: string): string {
  const cleaned = (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "endpoint";
}

/** YYYYMMDD stamp for filenames. */
export function dateStamp(date = new Date()): string {
  return (
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0")
  );
}
