import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENDPOINT,
  ENDPOINT_CONFIG_KEYS,
  newEndpointId,
  endpointFromCollection,
  endpointDisplayName,
} from "../../src/state/endpoint";
import type { Collection } from "../../src/types";

describe("newEndpointId", () => {
  it("starts with 'e' and is non-trivial in length", () => {
    const id = newEndpointId();
    expect(id.startsWith("e")).toBe(true);
    expect(id.length).toBeGreaterThan(5);
  });

  it("produces unique ids across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newEndpointId()));
    expect(ids.size).toBe(100);
  });
});

describe("DEFAULT_ENDPOINT", () => {
  it("uses the supplied id", () => {
    expect(DEFAULT_ENDPOINT("fixed-id").id).toBe("fixed-id");
  });

  it("generates an id when none is supplied", () => {
    expect(DEFAULT_ENDPOINT().id.startsWith("e")).toBe(true);
  });

  it("starts with a clean, disconnected runtime", () => {
    const e = DEFAULT_ENDPOINT();
    expect(e.status).toBe("idle");
    expect(e.messages).toEqual([]);
    expect(e.subscriptions).toEqual([]);
    expect(e.latency).toBeNull();
    expect(e.resultTab).toBe("messages");
    expect(e.filterDir).toBe("all");
  });

  it("defaults to the ws protocol with sensible config", () => {
    const e = DEFAULT_ENDPOINT();
    expect(e.protocol).toBe("ws");
    expect(e.rsModel).toBe("stream");
    expect(e.name).toBe("");
    expect(e.wsPayload).toContain("hello");
  });

  it("returns independent message arrays per call (no shared reference)", () => {
    const a = DEFAULT_ENDPOINT();
    const b = DEFAULT_ENDPOINT();
    expect(a.messages).not.toBe(b.messages);
    expect(a.subscriptions).not.toBe(b.subscriptions);
  });
});

describe("ENDPOINT_CONFIG_KEYS", () => {
  it("lists only config fields and excludes all runtime fields", () => {
    const runtimeFields = [
      "status",
      "statusText",
      "latency",
      "messages",
      "subscriptions",
      "resultTab",
      "filterText",
      "filterDir",
    ];
    for (const field of runtimeFields) {
      expect(ENDPOINT_CONFIG_KEYS).not.toContain(field);
    }
  });

  it("includes the identity and core config keys", () => {
    expect(ENDPOINT_CONFIG_KEYS).toContain("id");
    expect(ENDPOINT_CONFIG_KEYS).toContain("name");
    expect(ENDPOINT_CONFIG_KEYS).toContain("protocol");
    expect(ENDPOINT_CONFIG_KEYS).toContain("url");
  });
});

describe("endpointFromCollection", () => {
  it("maps the basic collection fields", () => {
    const collection: Collection = {
      id: "c1",
      name: "My API",
      protocol: "stomp",
      url: "wss://example.com/ws",
    };
    const e = endpointFromCollection(collection);
    expect(e.name).toBe("My API");
    expect(e.protocol).toBe("stomp");
    expect(e.url).toBe("wss://example.com/ws");
  });

  it("applies meta overrides when present", () => {
    const collection: Collection = {
      id: "c1",
      name: "X",
      protocol: "rsocket",
      url: "wss://x",
      meta: { stompDest: "/topic/custom", rsRoute: "feed", rsModel: "channel" },
    };
    const e = endpointFromCollection(collection);
    expect(e.stompSubDest).toBe("/topic/custom");
    expect(e.rsRoute).toBe("feed");
    expect(e.rsModel).toBe("channel");
  });

  it("keeps defaults when meta is absent", () => {
    const collection: Collection = { id: "c1", name: "X", protocol: "ws", url: "wss://x" };
    const fresh = DEFAULT_ENDPOINT();
    const e = endpointFromCollection(collection);
    expect(e.stompSubDest).toBe(fresh.stompSubDest);
    expect(e.rsRoute).toBe(fresh.rsRoute);
  });

  it("falls back to empty name when collection name is missing", () => {
    const collection = { id: "c1", protocol: "ws", url: "wss://x" } as Collection;
    expect(endpointFromCollection(collection).name).toBe("");
  });
});

describe("endpointDisplayName", () => {
  it("prefers an explicit trimmed name", () => {
    const e = DEFAULT_ENDPOINT();
    e.name = "  Orders  ";
    expect(endpointDisplayName(e)).toBe("Orders");
  });

  it("derives the last path segment from the URL when name is blank", () => {
    const e = DEFAULT_ENDPOINT();
    e.name = "";
    e.url = "wss://example.com/api/orders";
    expect(endpointDisplayName(e)).toBe("orders");
  });

  it("strips ws/wss scheme and query string before deriving", () => {
    const e = DEFAULT_ENDPOINT();
    e.name = "";
    e.url = "wss://example.com/stream?token=abc";
    expect(endpointDisplayName(e)).toBe("stream");
  });

  it("falls back to 'Untitled' when name and url are both empty", () => {
    const e = DEFAULT_ENDPOINT();
    e.name = "";
    e.url = "";
    expect(endpointDisplayName(e)).toBe("Untitled");
  });
});
