import { useCallback, useRef, useState } from "react";
import { KEYS, readAll } from "../lib/storage";
import {
  type Endpoint,
  type WorkspaceState,
  DEFAULT_ENDPOINT,
  DEFAULT_SETTINGS,
  ENDPOINT_CONFIG_KEYS,
  endpointFromCollection,
} from "./endpoint";
import type { Collection, Settings } from "../types";

/** Rehydrate a stored config object into a full Endpoint (fresh runtime). */
function rehydrate(config: Partial<Endpoint>): Endpoint {
  const endpoint = DEFAULT_ENDPOINT(typeof config.id === "string" ? config.id : undefined);
  const source = config as Record<string, unknown>;
  const target = endpoint as unknown as Record<string, unknown>;
  ENDPOINT_CONFIG_KEYS.forEach((key) => {
    if (source[key] !== undefined) target[key] = source[key];
  });
  return endpoint;
}

export function loadWorkspaceState(): WorkspaceState {
  const base: WorkspaceState = {
    endpoints: [],
    activeEndpointId: null,
    splitW: 480,
    settings: { ...DEFAULT_SETTINGS },
  };
  const stored = readAll(KEYS);
  if (!stored) return base;

  if (stored.settings && typeof stored.settings === "object")
    base.settings = { ...base.settings, ...(stored.settings as Partial<Settings>) };

  const storedEndpoints = stored.endpoints;
  if (Array.isArray(storedEndpoints) && storedEndpoints.length) {
    base.endpoints = storedEndpoints.map((c) => rehydrate(c as Partial<Endpoint>));
  } else {
    const legacy = stored.collections; // one-time migration
    if (Array.isArray(legacy)) base.endpoints = (legacy as Collection[]).map(endpointFromCollection);
  }

  const storedActive = stored.activeEndpoint;
  const activeId = typeof storedActive === "string" ? storedActive : null;
  base.activeEndpointId =
    base.endpoints.find((e) => e.id === activeId)?.id ?? base.endpoints[0]?.id ?? null;

  return base;
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(loadWorkspaceState);

  const patch = useCallback(
    (update: Partial<WorkspaceState>) => setState((prev) => ({ ...prev, ...update })),
    [],
  );

  const updateEndpoint = useCallback(
    (id: string, fn: (endpoint: Endpoint) => Endpoint) =>
      setState((prev) => ({
        ...prev,
        endpoints: prev.endpoints.map((e) => (e.id === id ? fn(e) : e)),
      })),
    [],
  );

  const patchEndpoint = useCallback(
    (id: string, partial: Partial<Endpoint>) =>
      updateEndpoint(id, (e) => ({ ...e, ...partial })),
    [updateEndpoint],
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  return { state, setState, patch, stateRef, updateEndpoint, patchEndpoint };
}
