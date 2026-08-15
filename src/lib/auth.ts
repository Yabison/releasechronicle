import { createHash, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

/** The value shipped in .env.example and defaulted by docker-compose. */
const PLACEHOLDER = "change-me";

export function isValidWriteToken(authHeader: string | null): boolean {
  const configured = process.env.RC_WRITE_TOKEN ?? "";
  // In production the placeholder counts as unconfigured: it is public, so honouring
  // it would leave the ingest API writable by anyone who read the repo. Deny rather
  // than throw — this runs per request, and a 401 is the honest answer.
  const expected = process.env.NODE_ENV === "production" && configured === PLACEHOLDER ? "" : configured;
  if (!authHeader || !expected) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  return safeEqual(authHeader.slice(prefix.length), expected);
}

/** Returns a 401 Response if the request lacks a valid write token, else null. */
export function requireWriteToken(req: Request): Response | null {
  if (isValidWriteToken(req.headers.get("authorization"))) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
