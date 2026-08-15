import { describe, it, expect } from "vitest";
import { serializeIdentity, parseIdentity, type Identity } from "@/lib/identity";

describe("serialize/parse round-trip", () => {
  it("keeps name and email", () => {
    const id: Identity = { name: "Alice", email: "a@x.io" };
    expect(parseIdentity(serializeIdentity(id))).toEqual(id);
  });
  it("keeps name when email is absent", () => {
    const id: Identity = { name: "Bob" };
    expect(parseIdentity(serializeIdentity(id))).toEqual({ name: "Bob" });
  });
});

describe("parseIdentity", () => {
  it("returns null for null/empty", () => {
    expect(parseIdentity(null)).toBeNull();
    expect(parseIdentity("")).toBeNull();
  });
  it("returns null for malformed JSON", () => {
    expect(parseIdentity("not json")).toBeNull();
  });
  it("returns null when name is missing or blank", () => {
    expect(parseIdentity(JSON.stringify({ email: "a@x.io" }))).toBeNull();
    expect(parseIdentity(JSON.stringify({ name: "   " }))).toBeNull();
  });
  it("drops a non-string email", () => {
    expect(parseIdentity(JSON.stringify({ name: "Al", email: 5 }))).toEqual({ name: "Al" });
  });
});
