import { describe, it, expect, beforeEach } from "vitest";
import { loadWorkspaceState } from "../../src/state/useWorkspace";
import { KEYS } from "../../src/lib/storage";
import { DEFAULT_ENDPOINT, ENDPOINT_CONFIG_KEYS } from "../../src/state/endpoint";
import type { Collection } from "../../src/types";

beforeEach(() => {
  localStorage.clear();
});

describe("loadWorkspaceState — empty / defaults", () => {
  it("returns a clean default workspace when storage is empty", () => {
    const state = loadWorkspaceState();
    expect(state.endpoints).toEqual([]);
    expect(state.activeEndpointId).toBeNull();
    expect(state.splitW).toBe(620);
    expect(state.settings.density).toBe("comfortable");
  });

  it("falls back to clean defaults when any stored key is corrupt", () => {
    localStorage.setItem(KEYS.endpoints, "{ corrupt");
    const state = loadWorkspaceState();
    expect(state.endpoints).toEqual([]);
    expect(state.activeEndpointId).toBeNull();
  });
});

describe("loadWorkspaceState — settings", () => {
  it("merges stored settings over defaults", () => {
    localStorage.setItem(KEYS.settings, JSON.stringify({ accent: "#123456" }));
    const state = loadWorkspaceState();
    expect(state.settings.accent).toBe("#123456");
    expect(state.settings.density).toBe("comfortable"); // default preserved
  });
});

describe("loadWorkspaceState — endpoint rehydration", () => {
  it("rehydrates stored endpoint configs with a fresh runtime", () => {
    const config = {
      ...Object.fromEntries(
        ENDPOINT_CONFIG_KEYS.map((k) => [k, DEFAULT_ENDPOINT("e1")[k]]),
      ),
      id: "e1",
      name: "Saved",
      url: "wss://saved/ws",
      // Runtime junk that should NOT survive rehydration:
      status: "open",
      messages: [{ id: 1 }],
    };
    localStorage.setItem(KEYS.endpoints, JSON.stringify([config]));

    const state = loadWorkspaceState();
    expect(state.endpoints).toHaveLength(1);
    const e = state.endpoints[0];
    expect(e.id).toBe("e1");
    expect(e.name).toBe("Saved");
    expect(e.url).toBe("wss://saved/ws");
    // runtime reset, not carried from storage
    expect(e.status).toBe("idle");
    expect(e.messages).toEqual([]);
  });

  it("selects the stored active endpoint when it still exists", () => {
    const mk = (id: string) => ({ ...DEFAULT_ENDPOINT(id), id });
    localStorage.setItem(KEYS.endpoints, JSON.stringify([mk("e1"), mk("e2")]));
    localStorage.setItem(KEYS.activeEndpoint, JSON.stringify("e2"));

    expect(loadWorkspaceState().activeEndpointId).toBe("e2");
  });

  it("falls back to the first endpoint when the stored active id is gone", () => {
    const mk = (id: string) => ({ ...DEFAULT_ENDPOINT(id), id });
    localStorage.setItem(KEYS.endpoints, JSON.stringify([mk("e1"), mk("e2")]));
    localStorage.setItem(KEYS.activeEndpoint, JSON.stringify("missing"));

    expect(loadWorkspaceState().activeEndpointId).toBe("e1");
  });
});

describe("loadWorkspaceState — legacy collection migration", () => {
  it("migrates legacy collections when no endpoints are stored", () => {
    const collections: Collection[] = [
      { id: "c1", name: "Legacy", protocol: "stomp", url: "wss://legacy/ws" },
    ];
    localStorage.setItem(KEYS.collections, JSON.stringify(collections));

    const state = loadWorkspaceState();
    expect(state.endpoints).toHaveLength(1);
    expect(state.endpoints[0].name).toBe("Legacy");
    expect(state.endpoints[0].protocol).toBe("stomp");
    expect(state.activeEndpointId).toBe(state.endpoints[0].id);
  });

  it("prefers stored endpoints over legacy collections", () => {
    localStorage.setItem(
      KEYS.endpoints,
      JSON.stringify([{ ...DEFAULT_ENDPOINT("e1"), id: "e1", name: "New" }]),
    );
    localStorage.setItem(
      KEYS.collections,
      JSON.stringify([{ id: "c1", name: "Old", protocol: "ws", url: "wss://old" }]),
    );

    const state = loadWorkspaceState();
    expect(state.endpoints).toHaveLength(1);
    expect(state.endpoints[0].name).toBe("New");
  });
});
