import { describe, it, expect } from "vitest";
import { securityHeaders } from "@/lib/securityHeaders";

const dev = securityHeaders({ nonce: "abc123", production: false });
const prod = securityHeaders({ nonce: "abc123", production: true });
const csp = (h: Record<string, string>) => h["content-security-policy"];

describe("securityHeaders", () => {
  it("lets only nonce-carrying scripts run", () => {
    expect(csp(prod)).toMatch(/script-src [^;]*'nonce-abc123'/);
    expect(csp(prod)).not.toMatch(/script-src [^;]*'unsafe-inline'/);
  });

  it("allows inline styles, which React style props require", () => {
    // A nonce cannot cover a style attribute, and the UI sets colours inline.
    expect(csp(prod)).toMatch(/style-src [^;]*'unsafe-inline'/);
  });

  it("blocks framing and plugin/base-tag hijacking", () => {
    expect(csp(prod)).toContain("frame-ancestors 'none'");
    expect(csp(prod)).toContain("base-uri 'self'");
    expect(csp(prod)).toContain("object-src 'none'");
    expect(prod["x-frame-options"]).toBe("DENY");
  });

  it("keeps the app from reaching third-party origins by default", () => {
    expect(csp(prod)).toContain("default-src 'self'");
    expect(csp(prod)).toMatch(/connect-src 'self'/);
  });

  it("sends HSTS only in production, where TLS is actually terminated", () => {
    expect(prod["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(dev["strict-transport-security"]).toBeUndefined();
  });

  it("upgrades insecure requests only in production", () => {
    expect(csp(prod)).toContain("upgrade-insecure-requests");
    expect(csp(dev)).not.toContain("upgrade-insecure-requests");
  });

  it("sets the remaining hardening headers", () => {
    expect(prod["x-content-type-options"]).toBe("nosniff");
    expect(prod["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(prod["permissions-policy"]).toContain("camera=()");
  });

  it("gives each request its own nonce value", () => {
    expect(csp(securityHeaders({ nonce: "n1", production: true }))).toContain("'nonce-n1'");
    expect(csp(securityHeaders({ nonce: "n2", production: true }))).toContain("'nonce-n2'");
  });
});
