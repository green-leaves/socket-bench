import { describe, it, expect } from "vitest";
import {
  serializeWorkspace,
  serializeEndpoint,
  parseImport,
  slug,
  dateStamp,
} from "../../src/lib/transfer";
import { DEFAULT_ENDPOINT, DEFAULT_SETTINGS } from "../../src/state/endpoint";

function sampleEndpoint(overrides: Partial<ReturnType<typeof DEFAULT_ENDPOINT>> = {}) {
  return { ...DEFAULT_ENDPOINT("e-fixed-id"), name: "Prod STOMP", url: "wss://x/y", ...overrides };
}

describe("serializeWorkspace", () => {
  it("wraps endpoints + settings in a versioned envelope", () => {
    const file = serializeWorkspace([sampleEndpoint()], DEFAULT_SETTINGS);
    expect(file.app).toBe("socketbench");
    expect(file.kind).toBe("workspace");
    expect(file.version).toBe(1);
    expect(file.endpoints).toHaveLength(1);
    expect(file.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("drops runtime fields, keeping only config", () => {
    const file = serializeWorkspace([sampleEndpoint()], DEFAULT_SETTINGS);
    const config = file.endpoints[0];
    expect(config).not.toHaveProperty("messages");
    expect(config).not.toHaveProperty("status");
    expect(config).toHaveProperty("url", "wss://x/y");
  });
});

describe("serializeEndpoint", () => {
  it("wraps a single endpoint config", () => {
    const file = serializeEndpoint(sampleEndpoint());
    expect(file.kind).toBe("endpoint");
    expect(file.endpoint).toHaveProperty("name", "Prod STOMP");
    expect(file.endpoint).not.toHaveProperty("subscriptions");
  });
});

describe("parseImport", () => {
  it("round-trips a workspace file back into endpoints", () => {
    const file = serializeWorkspace([sampleEndpoint()], DEFAULT_SETTINGS);
    const imported = parseImport(file);
    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe("Prod STOMP");
    expect(imported[0].url).toBe("wss://x/y");
  });

  it("round-trips a single-endpoint file", () => {
    const file = serializeEndpoint(sampleEndpoint());
    const imported = parseImport(file);
    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe("Prod STOMP");
  });

  it("assigns a fresh id so import never overwrites (same file twice => two ids)", () => {
    const file = serializeEndpoint(sampleEndpoint());
    const a = parseImport(file)[0];
    const b = parseImport(file)[0];
    expect(a.id).not.toBe("e-fixed-id");
    expect(b.id).not.toBe("e-fixed-id");
    expect(a.id).not.toBe(b.id);
  });

  it("gives imported endpoints clean runtime state", () => {
    const file = serializeEndpoint(sampleEndpoint());
    const imported = parseImport(file)[0];
    expect(imported.messages).toEqual([]);
    expect(imported.status).toBe("idle");
  });

  it("rejects a non-object", () => {
    expect(() => parseImport(null)).toThrow(/valid SocketBench/);
    expect(() => parseImport("nope")).toThrow(/valid SocketBench/);
  });

  it("rejects a foreign file (wrong app tag)", () => {
    expect(() => parseImport({ app: "something-else", kind: "workspace" })).toThrow(
      /valid SocketBench/,
    );
  });

  it("rejects an unknown kind", () => {
    expect(() => parseImport({ app: "socketbench", kind: "mystery" })).toThrow(/Unrecognized/);
  });

  it("rejects a workspace file with no endpoints array", () => {
    expect(() => parseImport({ app: "socketbench", kind: "workspace" })).toThrow(/no endpoints/);
  });
});

describe("slug", () => {
  it("lowercases and hyphenates", () => {
    expect(slug("Prod STOMP!")).toBe("prod-stomp");
  });

  it("trims leading/trailing separators", () => {
    expect(slug("  --Hello World--  ")).toBe("hello-world");
  });

  it("falls back to 'endpoint' for empty/symbol-only names", () => {
    expect(slug("")).toBe("endpoint");
    expect(slug("!!!")).toBe("endpoint");
  });
});

describe("dateStamp", () => {
  it("formats as YYYYMMDD with zero padding", () => {
    expect(dateStamp(new Date(2026, 5, 9))).toBe("20260609");
  });
});
