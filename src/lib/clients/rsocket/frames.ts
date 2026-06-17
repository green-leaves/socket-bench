import { enc } from "../util";

export const FT = {
  SETUP: 0x01,
  KEEPALIVE: 0x03,
  REQUEST_RESPONSE: 0x04,
  REQUEST_FNF: 0x05,
  REQUEST_STREAM: 0x06,
  REQUEST_CHANNEL: 0x07,
  REQUEST_N: 0x08,
  CANCEL: 0x09,
  PAYLOAD: 0x0a,
  ERROR: 0x0b,
  METADATA_PUSH: 0x0c,
} as const;

export const FLAG = {
  METADATA: 0x100,
  FOLLOWS: 0x80,
  COMPLETE: 0x40,
  NEXT: 0x20,
  RESPOND: 0x80,
} as const;

export function concat(arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (let i = 0; i < arrs.length; i++) len += arrs[i].length;
  const out = new Uint8Array(len);
  let off = 0;
  for (let i = 0; i < arrs.length; i++) {
    out.set(arrs[i], off);
    off += arrs[i].length;
  }
  return out;
}

export function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

export function u24(n: number): Uint8Array {
  return new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

export function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 255, n & 255]);
}

export function header(streamId: number, type: number, flags: number): Uint8Array {
  return concat([u32(streamId), u16((type << 10) | (flags & 0x3ff))]);
}

// composite metadata with a single routing entry
export function routingMetadata(route: string): Uint8Array {
  const r = enc.encode(route);
  const tag = concat([new Uint8Array([r.length]), r]); // routing: [len][route]
  const mimeId = 0x7e; // well-known: message/x.rsocket.routing.v0
  return concat([new Uint8Array([0x80 | mimeId]), u24(tag.length), tag]);
}
