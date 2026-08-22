import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserPreferences, homeTarget } from "@/lib/userPreferences";
import { getOverviewExtras, getOverview } from "@/lib/overview";
import { OverviewDashboard } from "@/components/OverviewDashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  // A chosen landing page, honoured before anything is queried. "/" is refused
  // as a target on the way in, so this cannot loop back onto itself.
  if (session) {
    const target = homeTarget(await getUserPreferences(session.sub));
    if (target && target !== "/") redirect(target);
  }

  const overview = await getOverview({}, !session);
  const extras = await getOverviewExtras(overview.events);
  return <OverviewDashboard overview={overview} {...extras} />;
}
