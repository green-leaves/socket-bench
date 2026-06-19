import { describe, it, expect } from "vitest";
import { leaf, rowsToObj } from "../../src/lib/util";

describe("leaf", () => {
  it("returns the last non-empty path segment", () => {
    expect(leaf("/topic/messages")).toBe("messages");
    expect(leaf("a/b/c")).toBe("c");
  });

  it("ignores trailing slashes", () => {
    expect(leaf("/app/hello/")).toBe("hello");
  });

  it("ignores empty segments from doubled slashes", () => {
    expect(leaf("foo//bar")).toBe("bar");
  });

  it("returns the whole string when there are no slashes", () => {
    expect(leaf("greeting")).toBe("greeting");
  });

  it("returns empty string for empty or slash-only input", () => {
    expect(leaf("")).toBe("");
    expect(leaf("///")).toBe("");
  });

  it("tolerates non-string-ish input via String coercion", () => {
    expect(leaf(null as unknown as string)).toBe("");
    expect(leaf(undefined as unknown as string)).toBe("");
  });
});

describe("rowsToObj", () => {
  it("collapses header rows into an object", () => {
    expect(
      rowsToObj([
        { key: "Authorization", value: "Bearer x" },
        { key: "Accept", value: "application/json" },
      ]),
    ).toEqual({ Authorization: "Bearer x", Accept: "application/json" });
  });

  it("trims whitespace from keys", () => {
    expect(rowsToObj([{ key: "  X-Id  ", value: "1" }])).toEqual({ "X-Id": "1" });
  });

  it("drops rows with blank or whitespace-only keys", () => {
    expect(
      rowsToObj([
        { key: "", value: "ignored" },
        { key: "   ", value: "ignored" },
        { key: "keep", value: "v" },
      ]),
    ).toEqual({ keep: "v" });
  });

  it("preserves empty values for valid keys", () => {
    expect(rowsToObj([{ key: "k", value: "" }])).toEqual({ k: "" });
  });

  it("last duplicate key wins", () => {
    expect(
      rowsToObj([
        { key: "k", value: "first" },
        { key: "k", value: "second" },
      ]),
    ).toEqual({ k: "second" });
  });

  it("returns an empty object for empty or nullish input", () => {
    expect(rowsToObj([])).toEqual({});
    expect(rowsToObj(null as unknown as never)).toEqual({});
  });
});
