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
 * warn and error go to stderr, info and debug to stdout, so an operator can
 * split the streams; a container collector sees both either way.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const DEFAULT = ORDER.info;

function threshold(): number {
  const raw = process.env.RC_LOG_LEVEL?.trim().toLowerCase();
  return raw && raw in ORDER ? ORDER[raw] : DEFAULT;
}

/**
 * Serialize with the three things that silently ruin structured logs:
 * `JSON.stringify(new Error())` is `{}`, a bigint throws, and a circular
 * reference throws.
 *
 * The circular check marks any object reached twice, so a value referenced by
 * two sibling fields also reads "[circular]". Payloads here are small and flat,
 * which makes that trade worth it: the alternative loses every field rather
 * than one. The outer catch is the last resort — a throwing getter, say — and
 * keeps the message even when the fields are unusable.
 */
function stringify(rec: Record<string, unknown>): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(rec, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[circular]";
        seen.add(v);
      }
      return v;
    });
  } catch {
    return JSON.stringify({ ts: rec.ts, level: rec.level, msg: rec.msg, logError: "fields could not be serialized" });
  }
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const rec: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
  // Envelope keys win: a field named `level` must not be able to make an error
  // look like an info line.
  if (fields) for (const [k, v] of Object.entries(fields)) if (!(k in rec)) rec[k] = v;
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
