import { listLotCandidates } from "@/lib/deployLot";
import { requestScope } from "@/lib/apiVisibility";

/** Deployments eligible to be grouped into a lot: ?company=&environment= (company-wide, one env).
 *  Session-only: it exists to feed the lot-creation modal, which needs write access
 *  anyway, and it lists deployments company-wide regardless of public flags. */
export async function GET(req: Request) {
  if ((await requestScope(req)).anonymous) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const u = new URL(req.url);
  const company = u.searchParams.get("company");
  const environment = u.searchParams.get("environment");
  if (!company || !environment) {
    return Response.json({ error: "company and environment query params are required" }, { status: 400 });
  }
  return Response.json(await listLotCandidates(company, environment));
}
