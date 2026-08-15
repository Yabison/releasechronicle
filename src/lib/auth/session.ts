import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRole, type Role } from "./roles";
import { authSecret as secret } from "./secret";

export type SessionUser = { sub: string; name: string; email?: string; roles: Role[] };

const COOKIE = "rc_session";
const DEFAULT_TTL = 60 * 60 * 8; // 8h

export async function signSession(user: SessionUser, ttlSeconds: number = DEFAULT_TTL): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name: user.name, email: user.email, roles: user.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const roles = Array.isArray(payload.roles) ? (payload.roles as unknown[]).filter(isRole) : [];
    if (typeof payload.sub !== "string" || typeof payload.name !== "string") return null;
    return { sub: payload.sub, name: payload.name, email: typeof payload.email === "string" ? payload.email : undefined, roles };
  } catch {
    return null;
  }
}

/** Parse a raw Cookie header and verify the session (route-handler friendly). */
export async function readSessionFromCookieHeader(header: string | null): Promise<SessionUser | null> {
  if (!header) return null;
  const match = header.split(/; */).find((c) => c.startsWith(`${COOKIE}=`));
  return verifySession(match ? match.slice(COOKIE.length + 1) : null);
}

export function sessionSetCookie(token: string, maxAge: number = DEFAULT_TTL): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}
export function sessionClearCookie(): string {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0;`;
}

/** Server-component/layout accessor (async cookies()). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(COOKIE)?.value);
}
export function hasRole(user: SessionUser | null, role: Role): boolean {
  return !!user && user.roles.includes(role);
}
export async function requireRole(role: Role, next?: string): Promise<SessionUser> {
  const s = await getSession();
  if (!hasRole(s, role)) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return s!;
}
