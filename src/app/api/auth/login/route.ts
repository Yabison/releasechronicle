import { getProvider } from "@/lib/auth/provider";
import { signSession, sessionSetCookie } from "@/lib/auth/session";
import { createRateLimiter } from "@/lib/rateLimit";
import { recordAudit, clientIpOf } from "@/lib/audit";

/**
 * Password guessing is throttled per (client IP, username): 5 failures buy a
 * 15-minute pause. Keying on the pair rather than the IP alone keeps one office
 * behind a shared NAT from locking itself out over a single user's typo.
 */
const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;
const limiter = createRateLimiter({ limit: LIMIT, windowMs: WINDOW_MS });

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = body && typeof body.username === "string" ? body.username : "";
  const password = body && typeof body.password === "string" ? body.password : "";
  if (!username || !password) return Response.json({ error: "username and password are required" }, { status: 400 });

  const ip = clientIp(req);
  const auditIp = clientIpOf(req);
  const key = `${ip}|${username.toLowerCase()}`;
  const now = Date.now();
  const verdict = limiter.check(key, now);
  if (!verdict.allowed) {
    // Logged apart from a plain bad password: a run of these is the signal that
    // someone is grinding, not that a colleague fat-fingered their password.
    await recordAudit({ action: "auth.login_blocked", actorIp: auditIp, target: username, ok: false });
    return Response.json(
      { error: "too many attempts" },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  const user = await getProvider().authenticate(username, password);
  if (!user) {
    limiter.fail(key, now);
    await recordAudit({ action: "auth.login_failed", actorIp: auditIp, target: username, ok: false, detail: { username } });
    return Response.json({ error: "invalid credentials" }, { status: 401 });
  }

  limiter.reset(key);
  await recordAudit({ action: "auth.login", actor: user.name, actorIp: auditIp, target: username, detail: { roles: user.roles } });
  const token = await signSession(user);
  return new Response(JSON.stringify({ ok: true, user: { name: user.name, roles: user.roles } }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": sessionSetCookie(token) },
  });
}
