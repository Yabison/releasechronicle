import { describe, it, expect } from "vitest";
import { checkOutboundUrl } from "@/lib/outboundUrl";

const ok = (raw: string, opts?: { blockPrivate?: boolean }) => checkOutboundUrl(raw, opts).ok;

describe("checkOutboundUrl", () => {
  it("accepts a plain https webhook", () => {
    expect(ok("https://hooks.example.com/services/abc")).toBe(true);
  });

  it("accepts http, since internal endpoints are often plain", () => {
    expect(ok("http://hooks.example.com/x")).toBe(true);
  });

  it("rejects a malformed url", () => {
    const r = checkOutboundUrl("not a url");
    expect(r).toEqual({ ok: false, reason: "url is malformed" });
  });

  it.each(["file:///etc/passwd", "gopher://x/1", "ftp://x/y", "data:text/plain,hi"])(
    "rejects the %s scheme",
    (raw) => {
      const r = checkOutboundUrl(raw);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toMatch(/http/);
    },
  );

  it("always blocks the cloud metadata address, even when private hosts are allowed", () => {
    const r = checkOutboundUrl("http://169.254.169.254/latest/meta-data/");
    expect(r).toEqual({ ok: false, reason: "url targets a link-local address" });
  });

  it("always blocks link-local more broadly and its IPv6 form", () => {
    expect(ok("http://169.254.1.1/x")).toBe(false);
    expect(ok("http://[fe80::1]/x")).toBe(false);
    expect(ok("http://[fd00:ec2::254]/latest")).toBe(false);
  });

  it("allows private and loopback targets by default (internal deployments need them)", () => {
    expect(ok("http://10.1.2.3/hook")).toBe(true);
    expect(ok("http://192.168.1.10:8080/hook")).toBe(true);
    expect(ok("http://127.0.0.1:9000/hook")).toBe(true);
    expect(ok("http://localhost:9000/hook")).toBe(true);
  });

  it("blocks private, loopback and localhost when asked to", () => {
    const strict = { blockPrivate: true };
    expect(ok("http://10.1.2.3/hook", strict)).toBe(false);
    expect(ok("http://172.16.0.1/hook", strict)).toBe(false);
    expect(ok("http://192.168.1.10/hook", strict)).toBe(false);
    expect(ok("http://127.0.0.1/hook", strict)).toBe(false);
    expect(ok("http://[::1]/hook", strict)).toBe(false);
    expect(ok("http://localhost/hook", strict)).toBe(false);
    expect(ok("http://api.localhost/hook", strict)).toBe(false);
  });

  it("still allows public hosts in strict mode", () => {
    expect(ok("https://hooks.example.com/x", { blockPrivate: true })).toBe(true);
    expect(ok("https://8.8.8.8/x", { blockPrivate: true })).toBe(true);
  });

  it("returns the normalised url so callers fetch exactly what was checked", () => {
    const r = checkOutboundUrl("https://hooks.example.com/a/../b");
    expect(r).toEqual({ ok: true, url: "https://hooks.example.com/b" });
  });
});
