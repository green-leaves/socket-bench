import { describe, it, expect } from "vitest";
import {
  SOH,
  checksum,
  encodeMessage,
  parseMessage,
  getField,
  prettyFrame,
  utcTimestamp,
  parseUserFields,
} from "../../src/lib/clients/fix/codec";

describe("checksum", () => {
  it("sums char codes mod 256, zero-padded to 3 digits", () => {
    // 'A'(65) + 'B'(66) + SOH(1) = 132
    expect(checksum("AB" + SOH)).toBe("132");
  });
  it("wraps at 256 and pads", () => {
    expect(checksum(String.fromCharCode(255) + String.fromCharCode(2))).toBe("001");
  });
});

describe("encodeMessage", () => {
  it("frames with BeginString, BodyLength and a consistent CheckSum", () => {
    const msg = encodeMessage("FIX.4.2", [
      [35, "0"],
      [49, "A"],
      [56, "B"],
      [34, 1],
      [52, "20240101-00:00:00.000"],
    ]);
    // body = "35=0|49=A|56=B|34=1|52=20240101-00:00:00.000|" (| = SOH) => length 45
    expect(msg.startsWith("8=FIX.4.2" + SOH + "9=45" + SOH)).toBe(true);
    expect(msg.endsWith(SOH)).toBe(true);
    // CheckSum field must equal checksum() of everything before it
    const cut = msg.lastIndexOf("10=");
    expect(msg.slice(cut)).toBe("10=" + checksum(msg.slice(0, cut)) + SOH);
  });
});

describe("parseMessage / getField", () => {
  it("splits SOH-delimited tag=value pairs", () => {
    const fields = parseMessage("8=FIX.4.4" + SOH + "35=A" + SOH + "108=30" + SOH);
    expect(getField(fields, 35)).toBe("A");
    expect(getField(fields, 108)).toBe("30");
    expect(getField(fields, 99)).toBeUndefined();
  });
});

describe("prettyFrame", () => {
  it("renders SOH as '|'", () => {
    expect(prettyFrame("8=FIX.4.4" + SOH + "35=0" + SOH)).toBe("8=FIX.4.4|35=0");
  });
});

describe("utcTimestamp", () => {
  it("formats as YYYYMMDD-HH:MM:SS.sss (UTC)", () => {
    expect(utcTimestamp(new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 6)))).toBe("20240102-03:04:05.006");
  });
});

describe("parseUserFields", () => {
  it("splits on | and newline into [tag, value]", () => {
    expect(parseUserFields("35=D | 55=AAPL\n38=100")).toEqual([
      [35, "D"],
      [55, "AAPL"],
      [38, "100"],
    ]);
  });
  it("throws on a field with no '='", () => {
    expect(() => parseUserFields("35=D | nope")).toThrow(/tag=value/);
  });
  it("throws on a non-numeric tag", () => {
    expect(() => parseUserFields("abc=1")).toThrow(/tag/);
  });
});
