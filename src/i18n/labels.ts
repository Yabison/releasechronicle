/** Localized labels for enum-ish values shown in the UI (deployment change types, phases). */

export const CHANGE_TYPES = ["NORMAL", "HOTFIX", "PRE_MEP", "POST_MEP", "POSTMEP_SQL"] as const;
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

/** Timeline category badge (MEP / HOTFIX / Incident / Maintenance). */
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
