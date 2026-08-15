/**
 * Single-use enforcement for one-click links.
 *
 * The unique index on `jti` is the lock: two concurrent clicks both try to insert,
 * one wins, the other gets P2002 and is told the link is spent. Recording on
 * consumption rather than on issue means unused links cost nothing.
 */
import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/http";

/** True if this token had not been used before and is now retired. */
export async function consumeActionToken(jti: string, eventId: string, usedIp: string | null): Promise<boolean> {
  try {
    await prisma.actionTokenUse.create({ data: { jti, eventId, usedIp } });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}
