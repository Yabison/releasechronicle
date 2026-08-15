/**
 * Guard for URLs the server itself will fetch (hook webhooks, Teams cards).
 *
 * An admin supplies these, so this is not a defence against outsiders — it limits
 * the damage a rogue or coerced admin, or a CSRF against one, can do by pointing a
 * hook at the infrastructure instead of at a chat service.
 *
 * Link-local is refused unconditionally: 169.254.169.254 and fd00:ec2::254 are the
 * cloud instance-metadata endpoints, which hand out credentials and are never a
 * legitimate notification target.
 *
 * Private and loopback ranges are *allowed* by default, because this app is meant to
 * be self-hosted and internal endpoints are the normal case. Set
 * RC_WEBHOOK_BLOCK_PRIVATE=true to refuse them too.
 *
 * Known limit: only address literals are inspected. A hostname that resolves to a
 * private address still passes, since checking DNS here would be both a second
 * resolution (the fetch does its own) and a TOCTOU race. Blocking egress at the
 * network is the real control; this is defence in depth.
 */
import { ipToBigInt, parseRule, type IpRule } from "./ipAllow";

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

const rules = (...cidrs: string[]): IpRule[] =>
  cidrs.map(parseRule).filter((r): r is IpRule => r !== null);

// 169.254/16 and fe80::/10 also cover the AWS/GCP/Azure metadata addresses.
const LINK_LOCAL = rules("169.254.0.0/16", "fe80::/10", "fd00:ec2::254/128");
const PRIVATE = rules("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "::1/128", "fc00::/7");

function inAny(ip: bigint, list: IpRule[]): boolean {
  return list.some((r) => (ip & r.mask) === r.base);
}

/** Strip the brackets an IPv6 host carries inside a URL. */
function hostAddress(hostname: string): bigint | null {
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return ipToBigInt(bare);
}

export function checkOutboundUrl(raw: string, opts: { blockPrivate?: boolean } = {}): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "url is malformed" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "only http(s) urls can be called" };
  }

  const ip = hostAddress(url.hostname);
  if (ip !== null && inAny(ip, LINK_LOCAL)) {
    return { ok: false, reason: "url targets a link-local address" };
  }

  if (opts.blockPrivate) {
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) {
      return { ok: false, reason: "url targets localhost" };
    }
    if (ip !== null && inAny(ip, PRIVATE)) {
      return { ok: false, reason: "url targets a private address" };
    }
  }

  return { ok: true, url: url.toString() };
}

/** Same check, reading the deployment's policy from the environment. */
export function checkConfiguredOutboundUrl(raw: string): UrlCheck {
  return checkOutboundUrl(raw, { blockPrivate: process.env.RC_WEBHOOK_BLOCK_PRIVATE === "true" });
}
