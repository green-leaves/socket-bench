import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENDPOINT,
  ENDPOINT_CONFIG_KEYS,
  rehydrate,
  toEndpointConfig,
} from "../../src/state/endpoint";

describe("FIX endpoint fields", () => {
  it("DEFAULT_ENDPOINT seeds FIX defaults", () => {
    const endpoint = DEFAULT_ENDPOINT("e1");
    expect(endpoint.fixBeginString).toBe("FIX.4.4");
    expect(endpoint.fixGatewayUrl).toBe("ws://localhost:9988");
    expect(endpoint.fixHeartBtInt).toBe("30");
    expect(endpoint.fixResetSeq).toBe(true);
    expect(endpoint.fixTls).toBe(false);
    expect(typeof endpoint.fixMessage).toBe("string");
  });

  it("persists and rehydrates FIX config fields", () => {
    for (const key of [
      "fixGatewayUrl",
      "fixHost",
      "fixPort",
      "fixTls",
      "fixBeginString",
      "fixSenderCompID",
      "fixTargetCompID",
      "fixHeartBtInt",
      "fixResetSeq",
      "fixUsername",
      "fixPassword",
      "fixMessage",
    ] as const) {
      expect(ENDPOINT_CONFIG_KEYS).toContain(key);
    }
    const source = {
      ...toEndpointConfig(DEFAULT_ENDPOINT("e2")),
      protocol: "fix",
      fixHost: "fix.example.com",
      fixPort: "9823",
      fixTls: true,
      fixSenderCompID: "ME",
    };
    const restored = rehydrate(source);
    expect(restored.protocol).toBe("fix");
    expect(restored.fixHost).toBe("fix.example.com");
    expect(restored.fixPort).toBe("9823");
    expect(restored.fixTls).toBe(true);
    expect(restored.fixSenderCompID).toBe("ME");
  });
});
