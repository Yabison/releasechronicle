import { SignJWT, jwtVerify } from "jose";
import { authSecret as secret } from "./auth/secret";

export type ActionToken = { eventId: string; to: string; jti: string };

/**
 * One-click links land in mailboxes and chat channels, where they get forwarded,
 * archived and indexed. Two days is enough for someone to act on a notification,
 * and the `jti` lets the server retire the link the first time it is used
 * (see consumeActionToken) so a copy found later is inert.
 */
const DEFAULT_TTL = 48 * 60 * 60;

export async function signActionToken(
  t: { eventId: string; to: string },
  ttlSeconds: number = DEFAULT_TTL,
  opts: { omitJti?: boolean } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({ ev: t.eventId, to: t.to })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds);
  // omitJti exists only so tests can forge a pre-single-use token and prove it is
  // refused; nothing in the app issues one.
  if (!opts.omitJti) builder.setJti(crypto.randomUUID());
  return builder.sign(secret());
}

export async function verifyActionToken(token: string | undefined | null): Promise<ActionToken | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.ev !== "string" || typeof payload.to !== "string") return null;
    // No jti means the token predates single-use enforcement and cannot be
    // retired after a click — refuse rather than let it stay replayable.
    if (typeof payload.jti !== "string" || payload.jti === "") return null;
    return { eventId: payload.ev, to: payload.to, jti: payload.jti };
  } catch {
    return null;
  }
}

export function actionUrl(token: string): string {
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/go/${token}`;
}
