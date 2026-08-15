/**
 * HMAC key for every JWT the app signs (session cookies, one-click action links).
 *
 * Outside production it falls back to a well-known literal so `npm run dev` and the
 * test suite work unconfigured. In production that fallback would let anyone forge
 * an admin session, so a missing AUTH_SECRET is a hard startup failure instead.
 */
const DEV_FALLBACK = "dev-insecure-secret-change-me";

export function authSecret(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  // Treat the literal as "unset": docker-compose passes it as an explicit default,
  // so an unconfigured deploy shows up here as a set-but-public value.
  const usable = configured && configured !== DEV_FALLBACK ? configured : null;
  if (!usable && process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production: without a private value the app signs sessions with a public one and any visitor can forge an admin login. Generate one with `openssl rand -base64 32`.",
    );
  }
  return new TextEncoder().encode(usable ?? DEV_FALLBACK);
}
