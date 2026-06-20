import { describe, it, expect } from "vitest";
import { render, VARIABLES } from "../../src/lib/templating";

describe("render", () => {
  it("replaces {{uuid}} with a v4 UUID", () => {
    const out = render('{"id":"{{uuid}}"}');
    const match = out.match(/"id":"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("generates a fresh value per occurrence", () => {
    const out = render("{{uuid}} {{uuid}}");
    const [a, b] = out.split(" ");
    expect(a).not.toBe(b);
  });

  it("renders {{timestamp}} as unix seconds", () => {
    const out = render("{{timestamp}}");
    const value = Number(out);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(1_700_000_000); // after 2023
  });

  it("renders {{isoTimestamp}} as an ISO date-time", () => {
    const out = render("{{isoTimestamp}}");
    expect(() => new Date(out).toISOString()).not.toThrow();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("renders {{randomInt}} within the default 0–1000 range", () => {
    for (let i = 0; i < 50; i++) {
      const value = Number(render("{{randomInt}}"));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("honors {{randomInt:min:max}} arguments", () => {
    for (let i = 0; i < 50; i++) {
      const value = Number(render("{{randomInt:5:7}}"));
      expect([5, 6, 7]).toContain(value);
    }
  });

  it("honors {{randomString:len}} length", () => {
    expect(render("{{randomString:16}}")).toHaveLength(16);
    expect(render("{{randomString}}")).toHaveLength(8);
  });

  it("renders {{randomBoolean}} as true or false", () => {
    expect(["true", "false"]).toContain(render("{{randomBoolean}}"));
  });

  it("tolerates inner whitespace", () => {
    expect(render("{{ randomBoolean }}")).toMatch(/^(true|false)$/);
  });

  it("leaves unknown tokens untouched", () => {
    expect(render("{{notAThing}}")).toBe("{{notAThing}}");
    expect(render("hello {{nope}} world")).toBe("hello {{nope}} world");
  });

  it("leaves text without tokens unchanged", () => {
    expect(render('{"plain":"json"}')).toBe('{"plain":"json"}');
  });
});

describe("VARIABLES catalogue", () => {
  it("every advertised token renders to something other than itself", () => {
    for (const variable of VARIABLES) {
      expect(render(variable.insert)).not.toBe(variable.insert);
    }
  });
});
