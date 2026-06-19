import { describe, it, expect } from "vitest";
import { concat, u32, u24, u16, header, routingMetadata } from "../../src/lib/clients/rsocket/frames";
import { enc } from "../../src/lib/clients/util";

describe("concat", () => {
  it("merges chunks in order", () => {
    const merged = concat([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns an empty array for no chunks", () => {
    expect(Array.from(concat([]))).toEqual([]);
  });

  it("handles empty chunks", () => {
    const merged = concat([new Uint8Array([]), new Uint8Array([7]), new Uint8Array([])]);
    expect(Array.from(merged)).toEqual([7]);
  });
});

describe("u32", () => {
  it("encodes a 32-bit value big-endian", () => {
    expect(Array.from(u32(0x01020304))).toEqual([1, 2, 3, 4]);
  });

  it("encodes zero as four zero bytes", () => {
    expect(Array.from(u32(0))).toEqual([0, 0, 0, 0]);
  });

  it("encodes the max 32-bit value", () => {
    expect(Array.from(u32(0xffffffff))).toEqual([255, 255, 255, 255]);
  });
});

describe("u24", () => {
  it("encodes a 24-bit value big-endian", () => {
    expect(Array.from(u24(0x010203))).toEqual([1, 2, 3]);
  });

  it("masks down to three bytes", () => {
    expect(Array.from(u24(0xffffff))).toEqual([255, 255, 255]);
  });
});

describe("u16", () => {
  it("encodes a 16-bit value big-endian", () => {
    expect(Array.from(u16(0x0102))).toEqual([1, 2]);
  });

  it("encodes the max 16-bit value", () => {
    expect(Array.from(u16(0xffff))).toEqual([255, 255]);
  });
});

describe("header", () => {
  it("produces a 6-byte frame header", () => {
    expect(header(1, 0x04, 0).length).toBe(6);
  });

  it("packs stream id, type, and flags", () => {
    // streamId=1, type=REQUEST_STREAM(0x06), no flags
    // type<<10 | flags = 0x06<<10 = 0x1800 -> bytes [0x18, 0x00]
    expect(Array.from(header(1, 0x06, 0))).toEqual([0, 0, 0, 1, 0x18, 0x00]);
  });

  it("masks flags to 10 bits and combines with the type field", () => {
    // type=PAYLOAD(0x0a), flags=NEXT|COMPLETE = 0x20|0x40 = 0x60
    // (0x0a<<10)|0x60 = 0x2800|0x60 = 0x2860 -> [0x28, 0x60]
    expect(Array.from(header(0, 0x0a, 0x60))).toEqual([0, 0, 0, 0, 0x28, 0x60]);
  });
});

describe("routingMetadata", () => {
  it("encodes a well-known routing mime with a single route entry", () => {
    const route = "greeting";
    const routeBytes = enc.encode(route);
    const result = routingMetadata(route);

    // [0x80 | 0x7e][u24(tagLen)][tagLen byte: routeLen][route bytes]
    expect(result[0]).toBe(0xfe); // 0x80 | well-known routing mime id 0x7e
    const tagLen = routeBytes.length + 1; // length-prefix byte + route bytes
    expect(Array.from(result.slice(1, 4))).toEqual([0, 0, tagLen]);
    expect(result[4]).toBe(routeBytes.length);
    expect(Array.from(result.slice(5))).toEqual(Array.from(routeBytes));
  });

  it("length-prefixes the route correctly for ASCII routes", () => {
    expect(Array.from(routingMetadata("ab"))).toEqual([
      0xfe, // mime
      0, 0, 3, // u24 tag length (1 len byte + 2 route bytes)
      2, // route length
      97, 98, // "ab"
    ]);
  });
});
