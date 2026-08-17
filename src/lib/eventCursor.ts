/**
 * Opaque pagination cursor for event feeds: a base64url-encoded (occurredAt, id)
 * pair matching the feed's `occurredAt DESC, id DESC` order. Encoding it keeps
 * callers from building cursors by hand and lets the shape evolve.
 */

export type EventCursor = { occurredAt: Date; id: string };

export function encodeEventCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ o: occurredAt.toISOString(), i: id })).toString("base64url");
}

/** Null on anything that is not a well-formed cursor — callers turn that into a 400. */
export function decodeEventCursor(token: string): EventCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { o, i } = parsed as { o?: unknown; i?: unknown };
  if (typeof o !== "string" || typeof i !== "string") return null;
  const occurredAt = new Date(o);
  if (Number.isNaN(occurredAt.getTime())) return null;
  return { occurredAt, id: i };
}
