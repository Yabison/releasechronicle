import { queryDoraData } from "@/lib/doraQuery";
import { computeDora } from "@/lib/dora";
import { requestScope } from "@/lib/apiVisibility";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const s = (k: string) => { const v = u.searchParams.get(k)?.trim(); return v ? v : undefined; };
  const rawDays = Number(u.searchParams.get("days"));
  const days = Number.isInteger(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
  const scope = await requestScope(req);
  const data = await queryDoraData({
    company: s("company"), product: s("product"), service: s("service"),
    environment: s("environment"), days,
    ...(scope.anonymous ? { publicScope: { envs: scope.envs } } : {}),
  });
  return Response.json(computeDora(data.deploys, data.incidents, data.windowDays));
}
