import type { ClientEvent } from "@/lib/timeline";
import { monthKey, monthLabel, type TimeOpts } from "@/lib/dateDisplay";

export type EntryCategory = "DEPLOY" | "HOTFIX" | "INCIDENT" | "MAINTENANCE";

export type TimelineEntry = {
  id: string; // entry id: event id, or `rollback:<rollbackId>`
  eventId: string; // underlying ClientEvent id (for the drawer)
  category: EntryCategory;
  environment: string;
  at: string; // ISO
  version: string | null;
  title: string;
  done: boolean; // finished incident (resolved) or finished maintenance — shown struck through
  endAt: string | null; // resolution / window-end time, shown on finished incidents & maintenances
  deployStatus?: string | null;
  rolledBack?: boolean; // deployment with at least one rollback — shown struck through
  lot?: string | null;
  durationMs?: number | null; // deployment: time from IN_PROGRESS to DEPLOYED
  tags?: string[];
  phase?: "PRE" | "POST"; // PRE_MEP / POST_MEP deployment
  warnPre?: boolean; // MEP ≤ PENDING with a linked PRE MEP not yet VALIDATE
  hourType?: string | null; // "HO" | "HNO" | null (deployment)
};

export type Counters = { deploy: number; hotfix: number; incident: number; maintenance: number };

export type ServiceTimeline = {
  history: TimelineEntry[];
  maintenances: TimelineEntry[];
  counters: Counters;
};

/** Severity of a timeline entry, mirroring the notification convention
 *  (red = error, orange = warning): rollback or an open incident is an error;
 *  a PRE-MEP mismatch (warnPre) or a PENDING deployment is a warning. A resolved
 *  incident, a healthy deployment, and maintenances carry no severity. */
export function entrySeverity(entry: TimelineEntry): "red" | "orange" | null {
  if (entry.category === "MAINTENANCE") return null;
  if (entry.category === "INCIDENT") return entry.done ? null : "red";
  // DEPLOY / HOTFIX
  if (entry.rolledBack) return "red";
  if (entry.warnPre || entry.deployStatus === "PENDING") return "orange";
  return null;
}

const byAtDesc = (a: TimelineEntry, b: TimelineEntry) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

const STATUS_LE_PENDING = new Set(["SCHEDULED", "GO_CONFIRMED", "PENDING"]);

export function buildServiceTimeline(events: ClientEvent[], now: Date = new Date()): ServiceTimeline {
  const history: TimelineEntry[] = [];
  const maintenances: TimelineEntry[] = [];
  const nowMs = now.getTime();

  // PRE MEP phases grouped by parent, to warn when one isn't VALIDATE yet.
  const preByParent = new Map<string, ClientEvent[]>();
  for (const e of events) {
    if (e.changeType === "PRE_MEP" && e.parentId) {
      const arr = preByParent.get(e.parentId) ?? [];
      arr.push(e);
      preByParent.set(e.parentId, arr);
    }
  }

  for (const e of events) {
    if (e.type === "MAINTENANCE") {
      // Past maintenances (window already ended) drop into the history timeline, struck
      // through with their end date; upcoming/ongoing ones stay pinned in the bucket.
      const endMs = new Date(e.windowEnd ?? e.occurredAt).getTime();
      const past = endMs < nowMs;
      const entry: TimelineEntry = {
        id: e.id, eventId: e.id, category: "MAINTENANCE", environment: e.environment,
        at: e.occurredAt, version: e.version, title: e.comment ?? "",
        done: past, endAt: past ? e.windowEnd : null, tags: e.tags,
      };
      if (past) history.push(entry);
      else maintenances.push(entry);
      continue;
    }
    if (e.type === "INCIDENT") {
      const resolved = e.incidentStatus === "RESOLVED" || e.resolvedAt !== null;
      history.push({
        id: e.id, eventId: e.id, category: "INCIDENT", environment: e.environment,
        at: e.occurredAt, version: null, title: e.comment ?? e.incidentType ?? "",
        done: resolved, endAt: resolved ? e.resolvedAt : null, tags: e.tags,
      });
      continue;
    }
    // DEPLOYMENT (or HOTFIX deployment)
    const category: EntryCategory = e.changeType === "HOTFIX" ? "HOTFIX" : "DEPLOY";
    // Deployment duration: from when work started (IN_PROGRESS, else the event's
    // occurredAt) to when it went live — or to the rollback if it was rolled back.
    // Shown for any deployment that reached DEPLOYED/TESTING/VALIDATE, or was rolled
    // back — including those created directly at a status (no tracked transitions).
    const LIVE = new Set(["DEPLOYED", "TESTING", "VALIDATE"]);
    const st = e.statusTransitions ?? [];
    const inProg = st.find((t) => t.toStatus === "IN_PROGRESS");
    const startMs = new Date(inProg ? inProg.createdAt : e.occurredAt).getTime();
    let endMs: number | null = null;
    if (e.rollbacks.length > 0) {
      endMs = Math.min(...e.rollbacks.map((r) => new Date(r.createdAt).getTime()));
    } else {
      const live = st.find((t) => LIVE.has(t.toStatus));
      if (live) endMs = new Date(live.createdAt).getTime();
      else if (e.deployStatus && LIVE.has(e.deployStatus)) endMs = new Date(e.occurredAt).getTime();
    }
    const durationMs = endMs != null && endMs >= startMs ? endMs - startMs : null;
    history.push({
      id: e.id, eventId: e.id, category, environment: e.environment,
      at: e.occurredAt, version: e.version, title: e.comment ?? "",
      done: false, endAt: null,
      deployStatus: e.deployStatus,
      rolledBack: e.rollbacks.length > 0,
      lot: e.lot,
      durationMs,
      tags: e.tags,
      hourType: e.hourType,
      phase: e.changeType === "PRE_MEP" ? "PRE" : e.changeType === "POST_MEP" ? "POST" : undefined,
      warnPre:
        (e.changeType === "NORMAL" || e.changeType === "HOTFIX") &&
        (e.deployStatus === null || STATUS_LE_PENDING.has(e.deployStatus)) &&
        (preByParent.get(e.id) ?? []).some((p) => p.deployStatus !== "VALIDATE"),
    });
  }

  history.sort(byAtDesc);
  maintenances.sort(byAtDesc);

  const counters: Counters = {
    deploy: history.filter((x) => x.category === "DEPLOY").length,
    hotfix: history.filter((x) => x.category === "HOTFIX").length,
    incident: history.filter((x) => x.category === "INCIDENT").length,
    maintenance: events.filter((e) => e.type === "MAINTENANCE").length,
  };

  return { history, maintenances, counters };
}

export type MonthGroup = { key: string; label: string; entries: TimelineEntry[] };

/**
 * Group rows under month headers. The timezone must be the one the row stamps use,
 * or an event near midnight on the 1st sits under a different month than its own
 * displayed date.
 */
export function groupByMonth(entries: TimelineEntry[], opts: TimeOpts): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const e of entries) {
    const key = monthKey(e.at, opts);
    let g = groups.get(key);
    if (!g) {
      g = { key, label: monthLabel(e.at, opts).toUpperCase(), entries: [] };
      groups.set(key, g);
    }
    g.entries.push(e);
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}
