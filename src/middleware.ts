import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseAllowlist, ipAllowed } from "@/lib/ipAllow";
import { securityHeaders, newNonce } from "@/lib/securityHeaders";

/**
 * App-wide IP restriction. When RC_IP_ALLOWLIST is set to one or more CIDR
 * blocks / addresses (comma or whitespace separated), any request whose client
 * IP is not covered gets a 403. Leaving the variable unset disables the check.
 *
 * The client IP is read from the proxy's x-forwarded-for (first hop) or
 * x-real-ip header, so this assumes the app sits behind a trusted reverse proxy.
 */
const raw = process.env.RC_IP_ALLOWLIST;
const rules = parseAllowlist(raw);

if (raw && raw.trim() !== "" && rules.length === 0) {
  // Non-empty config that parsed to nothing would silently fail open — warn loudly.
  console.warn("[ip-allowlist] RC_IP_ALLOWLIST is set but no valid rule parsed; restriction is INACTIVE");
}

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

export function middleware(req: NextRequest) {
  if (rules.length > 0) {
    const ip = clientIp(req);
    if (!ip || !ipAllowed(ip, rules)) return new NextResponse("Forbidden", { status: 403 });
  }

  const nonce = newNonce();
  const headers = securityHeaders({ nonce, production: process.env.NODE_ENV === "production" });

  // Next.js picks the nonce off the *request* CSP header and stamps it onto the
  // scripts it emits; without this forward, 'strict-dynamic' would block its own
  // bootstrap and the page would render blank.
  const forwarded = new Headers(req.headers);
  forwarded.set("content-security-policy", headers["content-security-policy"]);
  forwarded.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: forwarded } });
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

// Run on everything except Next's own static assets and the public logo.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
