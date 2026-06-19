import { describe, it, expect } from "vitest";
import { tryParseJSON, formatBytes, byteLen } from "../../src/lib/clients/util";

describe("tryParseJSON", () => {
  it("parses JSON objects", () => {
    expect(tryParseJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON arrays", () => {
    expect(tryParseJSON("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(tryParseJSON('  \n {"a":1} \t ')).toEqual({ a: 1 });
  });

  it("returns null for non-string input", () => {
    expect(tryParseJSON(42)).toBeNull();
    expect(tryParseJSON(null)).toBeNull();
    expect(tryParseJSON({ a: 1 })).toBeNull();
  });

  it("returns null for empty or whitespace-only strings", () => {
    expect(tryParseJSON("")).toBeNull();
    expect(tryParseJSON("   ")).toBeNull();
  });

  it("returns null for scalars and other non-object/array starts", () => {
    expect(tryParseJSON("123")).toBeNull();
    expect(tryParseJSON('"hello"')).toBeNull();
    expect(tryParseJSON("true")).toBeNull();
  });

  it("returns null for malformed JSON that starts with a brace", () => {
    expect(tryParseJSON("{ not valid")).toBeNull();
    expect(tryParseJSON("[1, 2,")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("returns an em dash for null or undefined", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });

  it("formats bytes under 1 KB plainly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes with two decimals", () => {
    expect(formatBytes(1048576)).toBe("1.00 MB");
    expect(formatBytes(1572864)).toBe("1.50 MB");
  });
});

describe("byteLen", () => {
  it("counts ASCII as one byte each", () => {
    expect(byteLen("hello")).toBe(5);
  });

  it("counts multi-byte UTF-8 characters correctly", () => {
    expect(byteLen("€")).toBe(3); // euro sign is 3 bytes in UTF-8
    expect(byteLen("é")).toBe(2);
  });

  it("coerces non-string input via String()", () => {
    expect(byteLen(123)).toBe(3);
    expect(byteLen(null)).toBe(4); // "null"
  });

  it("returns 0 for an empty string", () => {
    expect(byteLen("")).toBe(0);
  });
});
