/* templating.ts — Postman-style dynamic variables for outgoing payloads.
   Tokens like {{uuid}} or {{randomInt:1:100}} are expanded at send time, so the
   generated values are what actually go out (and what gets logged). A fresh
   value is produced for every occurrence; unknown tokens are left untouched. */

function randInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function randString(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  return out;
}

/** Parse `arg` as a finite number, falling back to `fallback` when absent/invalid. */
function num(arg: string | undefined, fallback: number): number {
  const value = Number(arg);
  return arg !== undefined && arg !== "" && Number.isFinite(value) ? value : fallback;
}

const generators: Record<string, (args: string[]) => string> = {
  uuid: () => crypto.randomUUID(),
  timestamp: () => String(Math.floor(Date.now() / 1000)),
  isoTimestamp: () => new Date().toISOString(),
  randomInt: (args) => String(randInt(num(args[0], 0), num(args[1], 1000))),
  randomFloat: (args) => {
    const lo = num(args[0], 0);
    const hi = num(args[1], 1);
    return String(Math.random() * (hi - lo) + lo);
  },
  randomString: (args) => randString(Math.max(0, Math.floor(num(args[0], 8)))),
  randomBoolean: () => (Math.random() < 0.5 ? "true" : "false"),
};

const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)((?::[^:}]*)*)\s*\}\}/g;

/** Expand all known {{variable}} tokens in `template`. */
export function render(template: string): string {
  return template.replace(TOKEN_RE, (match, name: string, argString: string) => {
    const generator = generators[name];
    if (!generator) return match; // leave unknown tokens as-is
    const args = argString ? argString.split(":").slice(1) : [];
    return generator(args);
  });
}

export interface VariableDef {
  /** Token inserted into the editor when picked. */
  insert: string;
  /** Short usage hint shown in the picker. */
  hint: string;
}

/** Catalogue surfaced by the variables picker. */
export const VARIABLES: VariableDef[] = [
  { insert: "{{uuid}}", hint: "Random UUID v4" },
  { insert: "{{timestamp}}", hint: "Unix time (seconds)" },
  { insert: "{{isoTimestamp}}", hint: "ISO 8601 date-time" },
  { insert: "{{randomInt}}", hint: "Integer 0–1000 · {{randomInt:min:max}}" },
  { insert: "{{randomFloat}}", hint: "Float 0–1 · {{randomFloat:min:max}}" },
  { insert: "{{randomString}}", hint: "Alphanumeric, length 8 · {{randomString:len}}" },
  { insert: "{{randomBoolean}}", hint: "true or false" },
];
