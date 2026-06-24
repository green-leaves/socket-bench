/* codec.ts — FIX tag=value encoding/decoding primitives (ASCII; SOH-delimited).
   Pure functions, no I/O. The FIXClient session engine builds on these. */

export const SOH = "\x01";

export interface FixField {
  tag: number;
  value: string;
}

/** 3-digit zero-padded mod-256 sum of the bytes up to (and including) the SOH
    before tag 10. FIX is ASCII, so char codes == byte values. */
export function checksum(prefix: string): string {
  let sum = 0;
  for (let i = 0; i < prefix.length; i++) sum += prefix.charCodeAt(i);
  return String(sum % 256).padStart(3, "0");
}

/** Build a complete FIX message. `body` is every field after BodyLength(9) and
    before CheckSum(10), in order, starting with MsgType(35). */
export function encodeMessage(beginString: string, body: Array<[number, string | number]>): string {
  const bodyStr = body.map(([tag, value]) => `${tag}=${value}`).join(SOH) + SOH;
  const head = `8=${beginString}${SOH}9=${bodyStr.length}${SOH}`;
  const prefix = head + bodyStr;
  return prefix + `10=${checksum(prefix)}${SOH}`;
}

export function parseMessage(frame: string): FixField[] {
  return frame
    .split(SOH)
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return { tag: Number(pair.slice(0, eq)), value: pair.slice(eq + 1) };
    });
}

export function getField(fields: FixField[], tag: number): string | undefined {
  const found = fields.find((field) => field.tag === tag);
  return found ? found.value : undefined;
}

/** Human-readable single-line rendering for the message log. */
export function prettyFrame(frame: string): string {
  return frame.split(SOH).filter(Boolean).join("|");
}

/** FIX SendingTime format: YYYYMMDD-HH:MM:SS.sss in UTC. */
export function utcTimestamp(date: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.` +
    `${pad(date.getUTCMilliseconds(), 3)}`
  );
}

/** Parse the composer's raw message (fields separated by `|` or newline). */
export function parseUserFields(raw: string): Array<[number, string]> {
  return raw
    .split(/[|\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) throw new Error(`Bad field "${pair}" — expected tag=value`);
      const tag = Number(pair.slice(0, eq));
      if (!Number.isInteger(tag) || tag <= 0) throw new Error(`Bad tag in "${pair}"`);
      return [tag, pair.slice(eq + 1)] as [number, string];
    });
}
