import { describe, it, expect } from "vitest";
import { parseAllowlist, parseRule, ipAllowed, ipToBigInt } from "@/lib/ipAllow";

describe("ipToBigInt", () => {
  it("maps IPv4 into the IPv4-mapped IPv6 range", () => {
    expect(ipToBigInt("1.2.3.4")).toBe((0xffffn << 32n) | 0x01020304n);
  });
  it("parses IPv6 with :: compression", () => {
    expect(ipToBigInt("::1")).toBe(1n);
    expect(ipToBigInt("2001:db8::1")).toBe((0x2001n << 112n) | (0xdb8n << 96n) | 1n);
  });
  it("treats IPv4-mapped IPv6 the same as the IPv4 address", () => {
    expect(ipToBigInt("::ffff:1.2.3.4")).toBe(ipToBigInt("1.2.3.4"));
  });
  it("rejects garbage", () => {
    expect(ipToBigInt("1.2.3")).toBeNull();
    expect(ipToBigInt("1.2.3.256")).toBeNull();
    expect(ipToBigInt("nope")).toBeNull();
    expect(ipToBigInt("")).toBeNull();
  });
});

describe("parseRule", () => {
  it("rejects malformed rules", () => {
    expect(parseRule("10.0.0.0/33")).toBeNull();
    expect(parseRule("2001:db8::/129")).toBeNull();
    expect(parseRule("garbage")).toBeNull();
    expect(parseRule("")).toBeNull();
  });
  it("accepts bare addresses as /32 or /128", () => {
    expect(parseRule("10.0.0.1")).not.toBeNull();
    expect(parseRule("2001:db8::1")).not.toBeNull();
  });
});

describe("ipAllowed", () => {
  it("empty allowlist allows everything", () => {
    expect(ipAllowed("1.2.3.4", parseAllowlist(""))).toBe(true);
    expect(ipAllowed("1.2.3.4", parseAllowlist(undefined))).toBe(true);
  });

  it("matches an IPv4 /24 block", () => {
    const rules = parseAllowlist("192.168.1.0/24");
    expect(ipAllowed("192.168.1.1", rules)).toBe(true);
    expect(ipAllowed("192.168.1.254", rules)).toBe(true);
    expect(ipAllowed("192.168.2.1", rules)).toBe(false);
  });

  it("matches a single IPv4 address", () => {
    const rules = parseAllowlist("10.0.0.5");
    expect(ipAllowed("10.0.0.5", rules)).toBe(true);
    expect(ipAllowed("10.0.0.6", rules)).toBe(false);
  });

  it("matches an IPv4-mapped IPv6 address against an IPv4 rule", () => {
    const rules = parseAllowlist("192.168.1.0/24");
    expect(ipAllowed("::ffff:192.168.1.9", rules)).toBe(true);
  });

  it("matches an IPv6 /32 block", () => {
    const rules = parseAllowlist("2001:db8::/32");
    expect(ipAllowed("2001:db8:1234::1", rules)).toBe(true);
    expect(ipAllowed("2001:db9::1", rules)).toBe(false);
  });

  it("supports multiple comma/space separated rules", () => {
    const rules = parseAllowlist("10.0.0.0/8, 172.16.0.0/12  192.168.0.0/16");
    expect(rules.length).toBe(3);
    expect(ipAllowed("10.5.5.5", rules)).toBe(true);
    expect(ipAllowed("172.16.9.9", rules)).toBe(true);
    expect(ipAllowed("192.168.9.9", rules)).toBe(true);
    expect(ipAllowed("8.8.8.8", rules)).toBe(false);
  });

  it("denies an unparseable client ip when rules are present", () => {
    const rules = parseAllowlist("10.0.0.0/8");
    expect(ipAllowed("not-an-ip", rules)).toBe(false);
  });

  it("/0 matches all", () => {
    const rules = parseAllowlist("0.0.0.0/0");
    expect(ipAllowed("8.8.8.8", rules)).toBe(true);
  });

  it("drops malformed entries but keeps valid ones", () => {
    const rules = parseAllowlist("garbage, 10.0.0.0/8");
    expect(rules.length).toBe(1);
    expect(ipAllowed("10.1.1.1", rules)).toBe(true);
  });
});
