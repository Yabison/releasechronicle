/**
 * IP allowlist matching for the app-wide access restriction.
 *
 * Everything is normalised to a 128-bit unsigned integer: IPv4 `a.b.c.d` maps to
 * the IPv4-mapped IPv6 form `::ffff:a.b.c.d`, so an IPv4 rule transparently also
 * matches the IPv4-mapped IPv6 address a proxy may forward. Rules are CIDR blocks
 * (`10.0.0.0/8`, `2001:db8::/32`) or bare addresses (treated as /32 or /128).
 *
 * Pure and edge-runtime safe (BigInt only, no Node built-ins) so it can run in
 * Next middleware and be unit-tested directly.
 */

export type IpRule = { base: bigint; mask: bigint };

const FULL = (1n << 128n) - 1n;
const V4_PREFIX = 0xffffn << 32n; // ::ffff:0:0

/** Parse "1.2.3.4" or "::ffff:1.2.3.4" or "2001:db8::1" to a 128-bit int, or null. */
export function ipToBigInt(ip: string): bigint | null {
  const s = ip.trim();
  if (s === "") return null;
  if (s.includes(":")) return ipv6ToBigInt(s);
  const v4 = ipv4ToInt(s);
  return v4 === null ? null : V4_PREFIX | v4;
}

function ipv4ToInt(s: string): bigint | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8n) | BigInt(v);
  }
  return n;
}

function ipv6ToBigInt(s: string): bigint | null {
  const halves = s.split("::");
  if (halves.length > 2) return null;

  const expand = (part: string): string[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    // A trailing IPv4 tail (e.g. ::ffff:1.2.3.4) becomes two 16-bit groups.
    const last = groups[groups.length - 1];
    if (last.includes(".")) {
      const v4 = ipv4ToInt(last);
      if (v4 === null) return null;
      groups.splice(groups.length - 1, 1,
        ((v4 >> 16n) & 0xffffn).toString(16),
        (v4 & 0xffffn).toString(16));
    }
    return groups;
  };

  const head = expand(halves[0]);
  const tail = halves.length === 2 ? expand(halves[1]) : [];
  if (head === null || tail === null) return null;

  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array(fill).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

/** Parse one CIDR or bare-address rule. Returns null if malformed. */
export function parseRule(rule: string): IpRule | null {
  const s = rule.trim();
  if (s === "") return null;
  const [addr, prefix] = s.split("/");
  const base = ipToBigInt(addr);
  if (base === null) return null;

  const isV4 = !addr.includes(":");
  const maxBits = 128;
  let bits: number;
  if (prefix === undefined) {
    bits = maxBits;
  } else {
    if (!/^\d{1,3}$/.test(prefix)) return null;
    const p = Number(prefix);
    // IPv4 prefix length is stated in v4 terms (0-32) but lives in the low 32
    // bits of the mapped address, so shift it into the 128-bit space.
    if (isV4) {
      if (p > 32) return null;
      bits = 96 + p;
    } else {
      if (p > 128) return null;
      bits = p;
    }
  }
  const mask = bits === 0 ? 0n : (FULL << BigInt(128 - bits)) & FULL;
  return { base: base & mask, mask };
}

/** Parse a comma/whitespace-separated allowlist. Malformed entries are dropped. */
export function parseAllowlist(value: string | undefined | null): IpRule[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map(parseRule)
    .filter((r): r is IpRule => r !== null);
}

/** True if `ip` falls inside any rule. Unparseable ip → false (deny). */
export function ipAllowed(ip: string, rules: IpRule[]): boolean {
  if (rules.length === 0) return true;
  const n = ipToBigInt(ip);
  if (n === null) return false;
  return rules.some((r) => (n & r.mask) === r.base);
}
