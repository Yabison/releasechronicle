import { getSession } from "@/lib/auth/session";
import { getOverviewExtras, getOverview } from "@/lib/overview";
import { OverviewDashboard } from "@/components/OverviewDashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  const overview = await getOverview({}, !session);
  const extras = await getOverviewExtras(overview.events);
  return <OverviewDashboard overview={overview} {...extras} />;
}
