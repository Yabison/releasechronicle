/** Localized labels for enum-ish values shown in the UI (deployment change types, phases). */

/** Selectable change types. POSTMEP_SQL is deliberately absent: it is retired
 *  from the UI, but the Postgres enum keeps the value so events already carrying
 *  it stay readable — dropping it from the enum would fail on any instance that
 *  has one. */
export const CHANGE_TYPES = ["NORMAL", "HOTFIX", "PRE_MEP", "POST_MEP"] as const;
export type ChangeTypeValue = (typeof CHANGE_TYPES)[number];

type Translate = (key: string) => string;

/** Label for a deployment change type; unknown values fall back to the raw value. */
export function changeTypeLabel(t: Translate, changeType: string | null | undefined): string {
  const value = changeType ?? "NORMAL";
  const key = `changeType.${value}`;
  const label = t(key);
  return label === key ? value : label;
}

/** Short PRE / POST badge shown on a phase deployment. */
export function phaseLabel(t: Translate, phase: "PRE" | "POST"): string {
  return t(`phase.${phase}`);
}

/** Localized wording of a deploy status ("Déployé", "En test", …). The raw enum
 *  names live in STATUS_META for the places that still show them. */
export function deployStatusLabel(t: Translate, status: string): string {
  const key = `deploy.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

/** The same status, spelled out for the timeline row, where there is room for
 *  a sentence: "Déployé - Test en attente" rather than "Déployé". The short form
 *  above stays for the seven-step stepper, which has one column per status. */
export function deployStatusLongLabel(t: Translate, status: string): string {
  const key = `deploy.statusLong.${status}`;
  const label = t(key);
  return label === key ? deployStatusLabel(t, status) : label;
}

/** Timeline category badge (RELEASE / HOTFIX / Incident / Maintenance). */
export function categoryLabel(t: Translate, category: string): string {
  const key = `category.${category}`;
  const label = t(key);
  return label === key ? category : label;
}

type TranslateVars = (key: string, vars?: Record<string, string | number>) => string;

/** Displayed reason for a rollback: the user's own words when they gave any,
 *  otherwise a localized sentence built from the version it rolled back to. */
export function rollbackText(
  t: TranslateVars,
  rb: { comment: string | null; previousVersion: string | null },
): string {
  if (rb.comment?.trim()) return rb.comment.trim();
  return rb.previousVersion
    ? t("rollback.toVersion", { version: rb.previousVersion })
    : t("rollback.unknownVersion");
}

/** Render a failed server action: its `err.*` key with its variables, where a
 *  variable that is itself an `err.*` key is translated first (nested reasons). */
export function actionMessage(
  t: TranslateVars,
  res: { error: string; vars?: Record<string, string | number> },
): string {
  const vars = res.vars
    ? Object.fromEntries(
        Object.entries(res.vars).map(([k, v]) => [k, typeof v === "string" && v.startsWith("err.") ? t(v) : v]),
      )
    : undefined;
  return t(res.error, vars);
}

/** Wording of one workflow violation from traceRelease, in the user's language. */
export function releaseIssueLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  issue: { kind: "OUT_OF_ORDER" | "SKIPPED"; environment: string },
): string {
  return t(issue.kind === "OUT_OF_ORDER" ? "trace.outOfOrder" : "trace.skipped", { env: issue.environment });
}
