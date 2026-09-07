/**
 * The house logger: one JSON object per line, nothing else.
 *
 * Deliberately dependency-free. `src/middleware.ts` runs on the edge runtime,
 * where the usual Node loggers (pino, winston) do not load, and this app has
 * already been bitten twice by a transitive Node dependency reaching an edge
 * or instrumentation bundle. Using only `console`, `JSON.stringify` and `Date`
 * keeps one logger usable on every runtime the app has.
 *
 * Level comes from RC_LOG_LEVEL (debug | info | warn | error | silent), default
 * info, read per call so a test can change it without re-importing the module.
 *
 * Call sites pass `mod` to name their subsystem — the structured replacement for
 * the `[audit]` / `[hooks]` prefixes the old console lines carried. Without it
 * you can filter by level and by message text but not by subsystem, which is
 * most of the point of going structured.
 *
 * warn and error go to stderr, info and debug to stdout, so an operator can
 * split the streams; a container collector sees both either way.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

// A Map, not an object: `"constructor" in {debug: 10, ...}` is true, which let
// RC_LOG_LEVEL=constructor resolve to a function. Every level comparison against
// a function is false, so the gate stopped suppressing anything and the app
// quietly switched to debug output.
const ORDER = new Map<string, number>([
  ["debug", 10], ["info", 20], ["warn", 30], ["error", 40], ["silent", 100],
]);
const DEFAULT = 20;

/** Envelope keys a caller's fields must not be able to overwrite. */
const RESERVED = new Set(["ts", "level", "msg"]);

function threshold(): number {
  const raw = process.env.RC_LOG_LEVEL?.trim().toLowerCase();
  return raw !== undefined && ORDER.has(raw) ? ORDER.get(raw)! : DEFAULT;
}

/**
 * Everything worth keeping off an Error. `JSON.stringify` shows none of it and
 * `console.error` showed all of it, so a plain {name, message, stack} would make
 * this logger strictly worse than the lines it replaced: Prisma puts the part you
 * actually needed on own properties (`code`, `meta`, `clientVersion`), `cause`
 * chains the underlying failure, and AggregateError hides every attempt in
 * `errors`.
 */
function errorFields(e: Error): Record<string, unknown> {
  const out: Record<string, unknown> = { name: e.name, message: e.message, stack: e.stack };
  for (const k of Object.keys(e)) {
    if (k !== "name" && k !== "message" && k !== "stack") out[k] = (e as unknown as Record<string, unknown>)[k];
  }
  // `cause` is an own but non-enumerable property, so Object.keys misses it.
  if (e.cause !== undefined) out.cause = e.cause;
  if (e instanceof AggregateError) out.errors = e.errors;
  return out;
}

/**
 * Serialize with the things that silently ruin structured logs: a bigint throws,
 * a circular reference throws, an Error collapses to `{}`, and a Map or Set
 * collapses to `{}` without so much as an error.
 *
 * The circular check marks any object reached twice, so a value referenced by
 * two sibling fields also reads "[circular]". Payloads here are small and flat,
 * which makes that trade worth it: the alternative loses every field rather than
 * one. It also guards the cause chain — an error whose cause is itself would
 * otherwise recurse forever, since each visit builds a fresh object.
 *
 * The outer catch is the last resort — a throwing getter, say — and keeps the
 * message even when the fields are unusable.
 */
function stringify(rec: Record<string, unknown>): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(rec, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v !== "object" || v === null) return v;
      if (seen.has(v)) return "[circular]";
      seen.add(v);
      if (v instanceof Error) return errorFields(v);
      if (v instanceof Map) return Object.fromEntries(v);
      if (v instanceof Set) return [...v];
      return v;
    });
  } catch {
    return JSON.stringify({ ts: rec.ts, level: rec.level, msg: rec.msg, logError: "fields could not be serialized" });
  }
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER.get(level)! < threshold()) return;
  const rec: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
  // Envelope keys win: a field named `level` must not be able to make an error
  // look like an info line. Reserving exactly three named keys rather than
  // testing `k in rec`, which is true for every Object.prototype member and so
  // silently dropped fields called `toString`, `constructor` and six others.
  // `__proto__` is refused rather than reserved: assigning it would set the
  // prototype instead of adding a field.
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (!RESERVED.has(k) && k !== "__proto__") rec[k] = v;
    }
  }
  const line = stringify(rec);
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
