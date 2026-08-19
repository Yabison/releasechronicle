import type { EntryCategory } from "./eventTimeline";

/**
 * The six category chips shared by the service page and the dashboards.
 *
 * PRE and POST are not categories in the data model — they are deployment
 * phases — but a reader filtering a list thinks of them as kinds of entry, so
 * they sit alongside the four real categories here.
 */
export const FILTER_KEYS = ["DEPLOY", "PRE", "POST", "HOTFIX", "INCIDENT", "MAINTENANCE"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export function isFilterKey(x: unknown): x is FilterKey {
  return typeof x === "string" && (FILTER_KEYS as readonly string[]).includes(x);
}

/** Which chip an entry answers to. */
export function entryFilterKey(entry: { category: EntryCategory; phase?: "PRE" | "POST" }): FilterKey {
  if (entry.category === "DEPLOY") return entry.phase ?? "DEPLOY";
  return entry.category;
}

/** Every deployment-ish chip: what the "releases" counter narrows to. */
export const DEPLOY_KEYS: FilterKey[] = ["DEPLOY", "PRE", "POST", "HOTFIX"];
