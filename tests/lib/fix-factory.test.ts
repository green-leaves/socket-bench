import { describe, it, expect } from "vitest";
import { createClient } from "../../src/lib/clientFactory";
import { FIXClient } from "../../src/lib/clients";
import { DEFAULT_ENDPOINT } from "../../src/state/endpoint";

describe("createClient FIX branch", () => {
  it("builds a FIXClient for protocol 'fix' with a gateway URL from the fields", () => {
    const endpoint = {
      ...DEFAULT_ENDPOINT("e1"),
      protocol: "fix" as const,
      fixGatewayUrl: "ws://localhost:9988",
      fixHost: "fix.example.com",
      fixPort: "9823",
      fixTls: true,
    };
    const client = createClient(endpoint, {
      onStatus: () => {},
      addMsg: () => {},
      err: () => {},
    });
    expect(client).toBeInstanceOf(FIXClient);
    expect((client as FIXClient).opts.url).toBe(
      "ws://localhost:9988/?host=fix.example.com&port=9823&tls=1",
    );
    expect((client as FIXClient).opts.session.senderCompID).toBe("CLIENT");
  });
});
