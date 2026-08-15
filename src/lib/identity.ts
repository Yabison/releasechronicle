export type Identity = { name: string; email?: string };

const COOKIE = "rc_identity";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Encode an identity as a cookie value (URL-encoded JSON). */
export function serializeIdentity(id: Identity): string {
  const payload: Identity = id.email ? { name: id.name, email: id.email } : { name: id.name };
  return encodeURIComponent(JSON.stringify(payload));
}

/** Decode a cookie value into an Identity, or null if absent/invalid/nameless. */
export function parseIdentity(raw: string | null): Identity | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.name !== "string" || rec.name.trim() === "") return null;
  const id: Identity = { name: rec.name.trim() };
  if (typeof rec.email === "string" && rec.email.trim() !== "") id.email = rec.email.trim();
  return id;
}

/** Read the identity from document.cookie (browser only). */
export function readIdentity(): Identity | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  return parseIdentity(match ? match.slice(COOKIE.length + 1) : null);
}

/** Persist the identity to document.cookie (browser only). */
export function writeIdentity(id: Identity): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=${serializeIdentity(id)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
