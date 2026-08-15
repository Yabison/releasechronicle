import { queryCalendar } from "@/lib/calendarQuery";
import { buildCalendar } from "@/lib/ics";
import { requestScope } from "@/lib/apiVisibility";

/** Subscribable iCalendar feed of deployments (planned/occurred) + maintenance windows.
 *  Readable without a session, but an anonymous subscriber only gets what public
 *  mode exposes. Filter with ?company=&product=&service=&environment=. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const s = (k: string) => { const v = u.searchParams.get(k)?.trim(); return v ? v : undefined; };
  const scope = await requestScope(req);
  const items = await queryCalendar({
    company: s("company"), product: s("product"), service: s("service"), environment: s("environment"),
    ...(scope.anonymous ? { publicScope: { envs: scope.envs, types: scope.types } } : {}),
  });
  return new Response(buildCalendar(items), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="releasechronicle.ics"',
      "cache-control": "no-cache",
    },
  });
}
