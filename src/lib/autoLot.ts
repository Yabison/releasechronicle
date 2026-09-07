import { prisma } from "@/lib/db";
import { autoLotWindowMinutes } from "@/lib/deployConfig";

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

type Cand = { id: string; lot: string | null; autoLot: boolean; occurredAt: Date; masterSlug: string | null };

/** Is a lot shared by more than one non-deleted deployment in the same environment?
 *  Lots are environment-scoped, so the count is too. */
async function isMultiMember(lot: string | null, environment: string): Promise<boolean> {
  if (!lot) return false;
  return (await prisma.event.count({ where: { lot, environment, type: "DEPLOYMENT", deletedAt: null } })) > 1;
}

/**
 * The same count as `isMultiMember`, for every candidate lot at once.
 *
 * Asking per candidate made `attachToAutoLot` cost one query per row in the
 * window, and the sweeper calls it once per deployment of the last 7 days — so the
 * sweep was quadratic in the number of deployments. One grouped count keeps it
 * linear. Lots absent from the result have no live deployment left.
 */
async function lotMemberCounts(lots: (string | null)[], environment: string): Promise<Map<string, number>> {
  const unique = [...new Set(lots.filter((l): l is string => !!l))];
  if (unique.length === 0) return new Map();
  const grouped = await prisma.event.groupBy({
    by: ["lot"],
    where: { lot: { in: unique }, environment, type: "DEPLOYMENT", deletedAt: null },
    _count: { _all: true },
  });
  return new Map(grouped.flatMap((g) => (g.lot ? [[g.lot, g._count._all] as [string, number]] : [])));
}

// `_now` is unused: the grouping window derives from the event's own occurredAt
// (see `from`/`to` below). Kept only so existing callers' signatures still match.
export async function attachToAutoLot(eventId: string, _now: Date = new Date()): Promise<{ lot: string | null; members: number }> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    include: { service: { include: { product: { include: { company: true } } } } },
  });
  if (!ev || ev.type !== "DEPLOYMENT" || ev.deletedAt || ev.service.deletedAt) return { lot: ev?.lot ?? null, members: 1 };
  if (!ev.autoLot && (await isMultiMember(ev.lot, ev.environment))) return { lot: ev.lot, members: 1 };

  const W = autoLotWindowMinutes() * 60_000;
  const from = new Date(ev.occurredAt.getTime() - W);
  const to = new Date(ev.occurredAt.getTime() + W);
  const rows = await prisma.event.findMany({
    where: {
      type: "DEPLOYMENT", deletedAt: null, environment: ev.environment,
      occurredAt: { gte: from, lte: to },
      service: { deletedAt: null, product: { companyId: ev.service.product.companyId } },
    },
    include: { service: { include: { product: true } } },
    orderBy: { occurredAt: "asc" },
  });

  const memberCounts = await lotMemberCounts(rows.map((r) => r.lot), ev.environment);
  const cands: Cand[] = [];
  for (const r of rows) {
    // rows are already filtered to ev.environment, so one count map covers them all.
    const eligible = r.autoLot || !r.lot || (memberCounts.get(r.lot) ?? 0) <= 1;
    if (!eligible) continue;
    cands.push({ id: r.id, lot: r.lot, autoLot: r.autoLot, occurredAt: r.occurredAt, masterSlug: r.service.isMaster ? r.service.slug : null });
  }
  if (cands.length <= 1) return { lot: ev.lot, members: 1 };

  const existing = cands.find((c) => c.autoLot && c.lot)?.lot ?? null;
  let lot = existing;
  if (!lot) {
    const anchor = cands.reduce((min, c) => (c.occurredAt < min ? c.occurredAt : min), cands[0].occurredAt);
    const naming = ev.service.product.company.autoLotNaming;
    const master = cands.find((c) => c.masterSlug)?.masterSlug ?? null;
    lot = naming === "master" && master ? `LOT-${master}-${stamp(anchor)}` : `LOT-AUTO-${stamp(anchor)}`;
  }
  const ids = cands.map((c) => c.id);
  await prisma.event.updateMany({ where: { id: { in: ids } }, data: { lot, autoLot: true } });
  return { lot, members: ids.length };
}

export async function sweepAutoLots(now: Date = new Date()): Promise<{ groups: number; assigned: number }> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const rows = await prisma.event.findMany({
    where: { type: "DEPLOYMENT", deletedAt: null, occurredAt: { gte: since }, service: { deletedAt: null } },
    orderBy: { occurredAt: "asc" }, select: { id: true },
  });
  let groups = 0, assigned = 0;
  for (const { id } of rows) {
    const r = await attachToAutoLot(id, now);
    if (r.members > 1) { groups++; assigned += r.members; }
  }
  return { groups, assigned };
}
