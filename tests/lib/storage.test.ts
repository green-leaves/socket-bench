import { describe, it, expect, beforeEach } from "vitest";
import { KEYS, readAll, write } from "../../src/lib/storage";

beforeEach(() => {
  localStorage.clear();
});

describe("readAll", () => {
  it("parses each key into its own slot", () => {
    localStorage.setItem(KEYS.settings, JSON.stringify({ accent: "#fff" }));
    localStorage.setItem(KEYS.activeEndpoint, JSON.stringify("e123"));

    const result = readAll(KEYS);
    expect(result).not.toBeNull();
    expect(result!.settings).toEqual({ accent: "#fff" });
    expect(result!.activeEndpoint).toBe("e123");
  });

  it("returns null for missing keys (parsed from 'null')", () => {
    const result = readAll(KEYS);
    expect(result).not.toBeNull();
    expect(result!.settings).toBeNull();
    expect(result!.endpoints).toBeNull();
    expect(result!.activeEndpoint).toBeNull();
    expect(result!.collections).toBeNull();
  });

  it("returns null entirely if ANY value is corrupt JSON (all-or-nothing)", () => {
    localStorage.setItem(KEYS.settings, JSON.stringify({ accent: "#fff" }));
    localStorage.setItem(KEYS.endpoints, "{ this is not json");

    expect(readAll(KEYS)).toBeNull();
  });
});

describe("write", () => {
  it("serializes and stores a value retrievable via readAll", () => {
    write(KEYS.activeEndpoint, "e999");
    expect(localStorage.getItem(KEYS.activeEndpoint)).toBe('"e999"');
    expect(readAll(KEYS)!.activeEndpoint).toBe("e999");
  });

  it("round-trips complex objects", () => {
    const endpoints = [{ id: "e1", name: "A" }];
    write(KEYS.endpoints, endpoints);
    expect(readAll(KEYS)!.endpoints).toEqual(endpoints);
  });
});
