import { describe, it, expect } from "vitest";
import { encodeEventCursor, decodeEventCursor } from "@/lib/eventCursor";

describe("event cursor codec", () => {
  it("round-trips an (occurredAt, id) pair", () => {
    const occurredAt = new Date("2026-06-25T09:30:00.123Z");
    const id = "ckx3f9a2b0001abcd";
    const decoded = decodeEventCursor(encodeEventCursor(occurredAt, id));
    expect(decoded).toEqual({ occurredAt, id });
  });

  it("produces an opaque URL-safe token", () => {
    const token = encodeEventCursor(new Date("2026-06-25T09:30:00Z"), "id+with/specials");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns null on garbage input", () => {
    expect(decodeEventCursor("not-a-cursor")).toBeNull();
    expect(decodeEventCursor("")).toBeNull();
    expect(decodeEventCursor("aGVsbG8")).toBeNull(); // valid base64url, wrong shape
  });

  it("returns null when the timestamp is not a valid date", () => {
    const forged = Buffer.from(JSON.stringify({ o: "yesterday", i: "x" })).toString("base64url");
    expect(decodeEventCursor(forged)).toBeNull();
  });

  it("returns null when the id is missing or not a string", () => {
    const noId = Buffer.from(JSON.stringify({ o: "2026-06-25T09:30:00.000Z" })).toString("base64url");
    expect(decodeEventCursor(noId)).toBeNull();
    const numId = Buffer.from(JSON.stringify({ o: "2026-06-25T09:30:00.000Z", i: 5 })).toString("base64url");
    expect(decodeEventCursor(numId)).toBeNull();
  });
});
