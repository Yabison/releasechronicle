import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { log } from "@/lib/log";

let out: string[];
let err: string[];
const savedLevel = process.env.RC_LOG_LEVEL;

beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(console, "log").mockImplementation((s: unknown) => { out.push(String(s)); });
  vi.spyOn(console, "error").mockImplementation((s: unknown) => { err.push(String(s)); });
  delete process.env.RC_LOG_LEVEL;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedLevel === undefined) delete process.env.RC_LOG_LEVEL;
  else process.env.RC_LOG_LEVEL = savedLevel;
});

describe("log", () => {
  it("emits a single JSON line carrying ts, level and msg", () => {
    log.info("hello");
    expect(out).toHaveLength(1);
    const rec = JSON.parse(out[0]);
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(Date.parse(rec.ts)).not.toBeNaN();
  });

  /**
   * The one-object-per-line contract, tested against input that could break it.
   * Asserting no newline in output built from newline-free input proves nothing.
   */
  it("stays on one line when the message and the fields contain newlines", () => {
    log.info("first\nsecond\r\nthird", { detail: "a\nb", nested: { deep: "c\r\nd" } });
    expect(out).toHaveLength(1);
    expect(out[0]).not.toContain("\n");
    expect(out[0]).not.toContain("\r");
    const rec = JSON.parse(out[0]);
    expect(rec.msg).toBe("first\nsecond\r\nthird");
    expect(rec.detail).toBe("a\nb");
    expect(rec.nested.deep).toBe("c\r\nd");
  });

  /** A value that looks like a whole log record cannot become one. */
  it("cannot be tricked into emitting a forged second record", () => {
    log.info("real", { env: 'prod"}\n{"ts":"2020-01-01T00:00:00.000Z","level":"error","msg":"forged' });
    expect(out).toHaveLength(1);
    const rec = JSON.parse(out[0]);
    expect(rec.msg).toBe("real");
    expect(rec.env).toContain("forged");
  });

  it("merges caller fields into the same object", () => {
    log.info("enqueued", { eventId: "evt_1", count: 3 });
    const rec = JSON.parse(out[0]);
    expect(rec.eventId).toBe("evt_1");
    expect(rec.count).toBe(3);
  });

  it("sends warn and error to stderr, info and debug to stdout", () => {
    process.env.RC_LOG_LEVEL = "debug";
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(out.map((l) => JSON.parse(l).level)).toEqual(["debug", "info"]);
    expect(err.map((l) => JSON.parse(l).level)).toEqual(["warn", "error"]);
  });

  /** JSON.stringify(new Error("boom")) is "{}" — the classic way a structured
   *  logger throws away the only detail anyone wanted. */
  it("serializes an Error to name, message and stack instead of an empty object", () => {
    log.error("send failed", { err: new TypeError("boom") });
    const rec = JSON.parse(err[0]);
    expect(rec.err.name).toBe("TypeError");
    expect(rec.err.message).toBe("boom");
    expect(typeof rec.err.stack).toBe("string");
  });

  it("drops records below the configured level", () => {
    process.env.RC_LOG_LEVEL = "warn";
    log.debug("d");
    log.info("i");
    log.warn("w");
    expect(out).toEqual([]);
    expect(err).toHaveLength(1);
    expect(JSON.parse(err[0]).msg).toBe("w");
  });

  it("defaults to info, and treats an unparseable level as info", () => {
    log.debug("d");
    log.info("i");
    process.env.RC_LOG_LEVEL = "chatty";
    log.debug("d2");
    log.info("i2");
    expect(out.map((l) => JSON.parse(l).msg)).toEqual(["i", "i2"]);
  });

  /**
   * `"constructor" in {debug: 10, ...}` is true, so an object lookup resolved to
   * a function and every level comparison against it came out false — silently
   * turning on debug output. Only `constructor` and `__proto__` actually reach
   * that bug: the others survive `.toLowerCase()` as `hasownproperty` and
   * `valueof`, which match nothing. They are here to pin that the lowercasing
   * keeps covering them.
   */
  it.each(["constructor", "__proto__", "hasOwnProperty", "valueOf"])(
    "does not let RC_LOG_LEVEL=%s unlock debug output",
    (level) => {
      process.env.RC_LOG_LEVEL = level;
      log.debug("d");
      log.info("i");
      expect(out.map((l) => JSON.parse(l).msg)).toEqual(["i"]);
    },
  );

  it("silences every level when asked", () => {
    process.env.RC_LOG_LEVEL = "silent";
    log.error("e");
    log.info("i");
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  /** A log line must never be the thing that breaks the path it observes. */
  it("still logs when a field is circular", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    expect(() => log.error("cyclic", { cyclic })).not.toThrow();
    const rec = JSON.parse(err[0]);
    expect(rec.msg).toBe("cyclic");
    expect(rec.cyclic.name).toBe("loop");
    expect(rec.cyclic.self).toBe("[circular]");
  });

  it("survives a field whose getter throws", () => {
    const hostile = { get boom(): never { throw new Error("nope"); } };
    expect(() => log.error("hostile", { hostile })).not.toThrow();
    const rec = JSON.parse(err[0]);
    expect(rec.msg).toBe("hostile");
    expect(rec.level).toBe("error");
  });

  it("serializes a bigint rather than throwing", () => {
    expect(() => log.info("big", { n: 10n })).not.toThrow();
    expect(JSON.parse(out[0]).n).toBe("10");
  });

  it("does not let a field overwrite the envelope", () => {
    log.info("real", { msg: "fake", level: "error", ts: "nope" });
    const rec = JSON.parse(out[0]);
    expect(rec.msg).toBe("real");
    expect(rec.level).toBe("info");
    expect(rec.ts).not.toBe("nope");
  });

  /**
   * The envelope reserves three keys. An `in` check reserved every
   * Object.prototype member too, so these fields vanished without a trace.
   */
  it("keeps fields named after Object.prototype members", () => {
    log.info("proto", { toString: "a", constructor: "b", valueOf: "c", hasOwnProperty: "d", keep: "e" });
    const rec = JSON.parse(out[0]);
    expect(rec.toString).toBe("a");
    expect(rec.constructor).toBe("b");
    expect(rec.valueOf).toBe("c");
    expect(rec.hasOwnProperty).toBe("d");
    expect(rec.keep).toBe("e");
  });

  it("refuses a __proto__ field rather than mangling the record", () => {
    expect(() => log.info("pollute", { __proto__: { polluted: true }, keep: "e" })).not.toThrow();
    const rec = JSON.parse(out[0]);
    expect(rec.msg).toBe("pollute");
    expect(rec.keep).toBe("e");
    expect(rec.polluted).toBeUndefined();
  });
});

/**
 * A Prisma failure carries what you actually needed on own properties, and
 * `console.error`'s util.inspect printed all of it. Keeping only name/message/
 * stack would have made this logger worse than the lines it replaced.
 */
describe("log error serialization", () => {
  it("keeps an error's own properties, the way Prisma attaches them", () => {
    const e = Object.assign(new Error("Unique constraint failed"), {
      name: "PrismaClientKnownRequestError", code: "P2002",
      meta: { target: ["slug"] }, clientVersion: "6.1.0",
    });
    log.error("audit write failed", { err: e });
    const rec = JSON.parse(err[0]);
    expect(rec.err.code).toBe("P2002");
    expect(rec.err.meta).toEqual({ target: ["slug"] });
    expect(rec.err.clientVersion).toBe("6.1.0");
    expect(rec.err.message).toBe("Unique constraint failed");
  });

  it("follows the cause chain", () => {
    const root = new TypeError("socket closed");
    log.error("send failed", { err: new Error("request failed", { cause: root }) });
    const rec = JSON.parse(err[0]);
    expect(rec.err.cause.name).toBe("TypeError");
    expect(rec.err.cause.message).toBe("socket closed");
    expect(typeof rec.err.cause.stack).toBe("string");
  });

  it("unpacks the attempts inside an AggregateError", () => {
    log.error("all attempts failed", {
      err: new AggregateError([new Error("ipv6 refused"), new Error("ipv4 timed out")], "fetch failed"),
    });
    const rec = JSON.parse(err[0]);
    expect(rec.err.errors.map((x: { message: string }) => x.message)).toEqual(["ipv6 refused", "ipv4 timed out"]);
  });

  /** Each visit builds a fresh object, so an unguarded cause chain recurses forever. */
  it("does not hang on an error that causes itself", () => {
    const e = new Error("loop");
    Object.defineProperty(e, "cause", { value: e, enumerable: false, configurable: true });
    expect(() => log.error("self-caused", { err: e })).not.toThrow();
    const rec = JSON.parse(err[0]);
    expect(rec.err.cause).toBe("[circular]");
  });

  it("does not collapse a Map or a Set to an empty object", () => {
    log.info("collections", { m: new Map([["k", 1]]), s: new Set(["a", "b"]) });
    const rec = JSON.parse(out[0]);
    expect(rec.m).toEqual({ k: 1 });
    expect(rec.s).toEqual(["a", "b"]);
  });
});
