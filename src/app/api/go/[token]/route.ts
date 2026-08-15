import { verifyActionToken } from "@/lib/actionToken";
import { consumeActionToken } from "@/lib/actionTokenUse";
import { recordAudit, clientIpOf } from "@/lib/audit";
import { transitionDeployStatus, DeployTransitionError } from "@/lib/events";
import { emitHooks } from "@/lib/hooks/dispatch";
import { DeployStatus } from "@prisma/client";
import "@/lib/hooks";

/**
 * One-click confirmation from a notification. The token is the authorisation: the
 * recipient has no session, so it stands in for one. That makes retiring it after
 * the first click the whole safety property — otherwise a forwarded or archived
 * mail keeps working for as long as the token lives.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIpOf(req);
  const fail = () => Response.redirect(new URL(`/go/${token}?error=1`, req.url), 303);

  const claim = await verifyActionToken(token);
  if (!claim) {
    await recordAudit({ action: "deploy.one_click", actorIp: ip, ok: false, detail: { reason: "invalid or expired token" } });
    return fail();
  }

  if (!(await consumeActionToken(claim.jti, claim.eventId, ip))) {
    await recordAudit({
      action: "deploy.one_click", actorIp: ip, target: claim.eventId, ok: false,
      detail: { reason: "token already used", to: claim.to },
    });
    return fail();
  }

  try {
    await transitionDeployStatus(claim.eventId, { to: claim.to as DeployStatus, actorName: "lien", actorEmail: null, comment: null });
  } catch (e) {
    if (e instanceof DeployTransitionError) {
      await recordAudit({
        action: "deploy.one_click", actorIp: ip, target: claim.eventId, ok: false,
        detail: { reason: "transition not allowed", to: claim.to },
      });
      return fail();
    }
    throw e;
  }

  await recordAudit({ action: "deploy.one_click", actor: "lien", actorIp: ip, target: claim.eventId, detail: { to: claim.to } });
  emitHooks(claim.eventId, "deploy.status_changed", "lien");
  return Response.redirect(new URL(`/go/${token}?done=1`, req.url), 303);
}
