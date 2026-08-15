import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isValidWriteToken, requireWriteToken } from "@/lib/auth";

beforeEach(() => {
  process.env.RC_WRITE_TOKEN = "secret";
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("isValidWriteToken", () => {
  it("accepts a matching Bearer header", () => {
    expect(isValidWriteToken("Bearer secret")).toBe(true);
  });
  it("rejects a wrong token", () => {
    expect(isValidWriteToken("Bearer nope")).toBe(false);
  });
  it("rejects a missing header", () => {
    expect(isValidWriteToken(null)).toBe(false);
  });
  it("rejects a non-Bearer scheme", () => {
    expect(isValidWriteToken("secret")).toBe(false);
  });
  it("rejects 'Bearer ' with an empty token", () => {
    expect(isValidWriteToken("Bearer ")).toBe(false);
  });
  it("rejects a wrong scheme like Basic", () => {
    expect(isValidWriteToken("Basic c2VjcmV0")).toBe(false);
  });
  it("refuses the shipped placeholder in production", () => {
    // .env.example and docker-compose both default to "change-me"; accepting it
    // would leave the ingest API open to anyone who read the repo.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RC_WRITE_TOKEN", "change-me");
    expect(isValidWriteToken("Bearer change-me")).toBe(false);
  });
  it("still accepts the placeholder outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RC_WRITE_TOKEN", "change-me");
    expect(isValidWriteToken("Bearer change-me")).toBe(true);
  });
});

describe("requireWriteToken", () => {
  it("returns null when authorized", () => {
    const req = new Request("http://x", { headers: { authorization: "Bearer secret" } });
    expect(requireWriteToken(req)).toBeNull();
  });
  it("returns a 401 Response when unauthorized", () => {
    const req = new Request("http://x");
    const res = requireWriteToken(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
  it("requireWriteToken returns 401 for a wrong-scheme header", () => {
    const req = new Request("http://x", { headers: { authorization: "Basic c2VjcmV0" } });
    const res = requireWriteToken(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});
