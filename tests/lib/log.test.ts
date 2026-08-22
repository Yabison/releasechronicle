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
    expect(out[0]).not.toContain("\n");
    const rec = JSON.parse(out[0]);
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(Date.parse(rec.ts)).not.toBeNaN();
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
});
