export type ClientAnnotations = {
  rollbacks: {
    id: string; comment: string | null; previousVersion: string | null;
    actorName: string | null; link: string | null; createdAt: string;
  }[];
  qaValidations: { id: string; validatedBy: string; comment: string | null }[];
  observations: { id: string; who: string; durationMinutes: number; comment: string | null }[];
  statusTransitions: {
    id: string; fromStatus: string | null; toStatus: string;
    actorName: string | null; actorEmail: string | null; comment: string | null; createdAt: string;
  }[];
  comments: { id: string; author: string | null; body: string; createdAt: string }[];
};

export type ClientEvent = {
  id: string;
  serviceId: string;
  environment: string;
  type: "DEPLOYMENT" | "INCIDENT" | "MAINTENANCE";
  occurredAt: string; // ISO (UTC)
  version: string | null;
  requester: string | null;
  changeType: string | null;
  externalLink: string | null;
  deployStatus: string | null;
  incidentType: string | null;
  incidentStatus: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  comment: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  tags: string[];
  causedById: string | null;
  parentId: string | null;
  hourType: string | null;
  derived: { status?: string; minutes?: number; open?: boolean };
  lot: string | null;
} & ClientAnnotations;

function iso(d: Date | string | null): string | null {
  if (d === null) return null;
  return typeof d === "string" ? d : d.toISOString();
}

/** Map service-layer event rows (Prisma Dates + derived + annotations) to the serializable client shape. */
export function toClientEvents(rows: Array<Record<string, unknown>>): ClientEvent[] {
  return rows.map((r) => ({
    id: r.id as string,
    serviceId: r.serviceId as string,
    environment: r.environment as string,
    type: r.type as ClientEvent["type"],
    occurredAt: iso(r.occurredAt as Date) as string,
    version: (r.version as string) ?? null,
    requester: (r.requester as string) ?? null,
    changeType: (r.changeType as string) ?? null,
    externalLink: (r.externalLink as string) ?? null,
    deployStatus: (r.deployStatus as string) ?? null,
    incidentType: (r.incidentType as string) ?? null,
    incidentStatus: (r.incidentStatus as string) ?? null,
    startedAt: iso((r.startedAt as Date) ?? null),
    resolvedAt: iso((r.resolvedAt as Date) ?? null),
    comment: (r.comment as string) ?? null,
    windowStart: iso((r.windowStart as Date) ?? null),
    windowEnd: iso((r.windowEnd as Date) ?? null),
    tags: (r.tags as string[]) ?? [],
    causedById: (r.causedById as string) ?? null,
    parentId: (r.parentId as string) ?? null,
    hourType: (r.hourType as string) ?? null,
    derived: (r.derived as ClientEvent["derived"]) ?? {},
    lot: (r.lot as string) ?? null,
    rollbacks: ((r.rollbacks as Array<{ id: string; comment: string | null; previousVersion: string | null; actorName: string | null; link: string | null; createdAt: Date }>) ?? []).map(
      (rb) => ({
        id: rb.id, comment: rb.comment ?? null, previousVersion: rb.previousVersion ?? null,
        actorName: rb.actorName ?? null, link: rb.link ?? null, createdAt: iso(rb.createdAt) as string,
      }),
    ),
    qaValidations: ((r.qaValidations as Array<{ id: string; validatedBy: string; comment: string | null }>) ?? []).map(
      (q) => ({ id: q.id, validatedBy: q.validatedBy, comment: q.comment ?? null }),
    ),
    observations: ((r.observations as Array<{ id: string; who: string; durationMinutes: number; comment: string | null }>) ?? []).map(
      (o) => ({ id: o.id, who: o.who, durationMinutes: o.durationMinutes, comment: o.comment ?? null }),
    ),
    statusTransitions: ((r.statusTransitions as Array<{ id: string; fromStatus: string | null; toStatus: string; actorName: string | null; actorEmail: string | null; comment: string | null; createdAt: Date }>) ?? []).map(
      (t) => ({
        id: t.id, fromStatus: t.fromStatus ?? null, toStatus: t.toStatus,
        actorName: t.actorName ?? null, actorEmail: t.actorEmail ?? null,
        comment: t.comment ?? null, createdAt: iso(t.createdAt) as string,
      }),
    ),
    comments: ((r.comments as Array<{ id: string; author: string | null; body: string; createdAt: Date }>) ?? []).map(
      (c) => ({ id: c.id, author: c.author ?? null, body: c.body, createdAt: iso(c.createdAt) as string }),
    ),
  }));
}

export type FilterCriteria = {
  environment?: string;
  type?: string;
  serviceId?: string;
  from?: string; // ISO date or datetime
  to?: string;
  tags?: string[];
};

export function filterEvents(events: ClientEvent[], c: FilterCriteria): ClientEvent[] {
  return events.filter((e) => {
    if (c.environment && e.environment !== c.environment) return false;
    if (c.type && e.type !== c.type) return false;
    if (c.serviceId && e.serviceId !== c.serviceId) return false;
    if (c.from && e.occurredAt < c.from) return false;
    if (c.to && e.occurredAt > c.to + "￿") return false; // include the whole `to` day
    if (c.tags && c.tags.length > 0 && !c.tags.every((t) => e.tags.includes(t))) return false;
    return true;
  });
}

export function groupByDay(events: ClientEvent[]): { day: string; events: ClientEvent[] }[] {
  const byDay = new Map<string, ClientEvent[]>();
  for (const e of events) {
    const day = e.occurredAt.slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(e);
    else byDay.set(day, [e]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, evs]) => ({
      day,
      events: evs.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
    }));
}

export type Appearance = { color: "green" | "red" | "orange" | "blue"; label: string; striped?: boolean; badge?: string };

export function eventAppearance(e: ClientEvent): Appearance {
  if (e.type === "DEPLOYMENT") {
    const color = e.rollbacks.length > 0 ? "red" : e.deployStatus === "PENDING" ? "orange" : "green";
    return { color, label: `Deploy ${e.version ?? ""}`.trim() };
  }
  if (e.type === "INCIDENT") {
    return { color: "orange", label: `Incident: ${e.incidentType ?? ""}`.trim(), striped: e.derived.open === true };
  }
  return { color: "blue", label: "Maintenance", badge: e.derived.status };
}

export type CalendarCell = {
  date: string; // YYYY-MM-DD
  outside: boolean; // belongs to an adjacent month
  events: ClientEvent[]; // non-maintenance events occurring this day
  maintenances: ClientEvent[]; // maintenance windows covering this day
};

/** Build a 6-row × 7-col month grid (weeks start Monday) for the given 1-based month. */
export function calendarCells(events: ClientEvent[], year: number, month: number): CalendarCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7; // Monday=0
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - startWeekday);

  const weeks: CalendarCell[][] = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const row: CalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = cursor.toISOString().slice(0, 10);
      const inMonth = cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month - 1;
      row.push({
        date,
        outside: !inMonth,
        events: events.filter((e) => e.type !== "MAINTENANCE" && e.occurredAt.slice(0, 10) === date),
        maintenances: events.filter(
          (e) =>
            e.type === "MAINTENANCE" &&
            e.windowStart !== null &&
            e.windowEnd !== null &&
            e.windowStart.slice(0, 10) <= date &&
            date <= e.windowEnd.slice(0, 10),
        ),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

export type EventSummary = { id: string; type: ClientEvent["type"]; environment: string; occurredAt: string };

export function resolveCausal(
  event: ClientEvent,
  all: ClientEvent[],
): { causedBy?: EventSummary; led: EventSummary[] } {
  const toSummary = (e: ClientEvent): EventSummary => ({ id: e.id, type: e.type, environment: e.environment, occurredAt: e.occurredAt });
  const causedBy = event.causedById ? all.find((e) => e.id === event.causedById) : undefined;
  const led = all.filter((e) => e.causedById === event.id);
  return { causedBy: causedBy ? toSummary(causedBy) : undefined, led: led.map(toSummary) };
}
