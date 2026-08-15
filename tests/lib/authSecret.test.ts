import { describe, it, expect, afterEach, vi } from "vitest";
import { authSecret } from "@/lib/auth/secret";

afterEach(() => { vi.unstubAllEnvs(); });

describe("authSecret", () => {
  it("refuses to start production on the dev fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
  });

  it("refuses the dev literal even when it is set explicitly", () => {
    // docker-compose ships `${AUTH_SECRET:-dev-insecure-secret-change-me}`, so an
    // unconfigured deploy arrives as a *set* value, not an absent one.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "dev-insecure-secret-change-me");
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
  });

  it("uses the configured secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "a-real-secret");
    expect(authSecret()).toEqual(new TextEncoder().encode("a-real-secret"));
  });

  it("falls back outside production so dev and tests run unconfigured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    expect(authSecret().length).toBeGreaterThan(0);
  });
});
