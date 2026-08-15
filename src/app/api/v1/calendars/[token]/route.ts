import { getCalendarFeedByToken, feedFilter } from "@/lib/calendarFeeds";
import { queryCalendar } from "@/lib/calendarQuery";
import { buildCalendar } from "@/lib/ics";

/** Public iCalendar feed identified by token; URL ends with .ics (stripped). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const feed = await getCalendarFeedByToken(token.replace(/\.ics$/, ""));
  if (!feed) return new Response("not found", { status: 404 });
  const items = await queryCalendar(feedFilter(feed));
  return new Response(buildCalendar(items), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="${feed.token}.ics"`,
      "cache-control": "no-cache",
    },
  });
}
