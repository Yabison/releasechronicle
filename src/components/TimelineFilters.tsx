"use client";

import { useI18n } from "@/i18n/useI18n";
import styles from "./DetailPane.module.css";

export type TimelineQuery = {
  version: string;
  requester: string;
  tags: string[];
  hourType: string;
  from: string;
  to: string;
};

/**
 * The labelled filter row, shared by the service page and the dashboards.
 *
 * Dates are handed back through their own callback rather than folded into
 * `onChange`: on the service page they re-window the server query, on a
 * dashboard they only narrow what is already loaded. The caller owns that
 * difference; the fields look and read the same either way.
 */
export function TimelineFilters({
  value,
  onChange,
  onDates,
  onReset,
  allTags,
  tagInput,
  onTagInput,
  tagColors = {},
}: {
  value: TimelineQuery;
  onChange: (patch: Partial<TimelineQuery>) => void;
  onDates: (patch: { from?: string; to?: string }) => void;
  onReset: (() => void) | null;
  allTags: string[];
  tagInput: string;
  onTagInput: (v: string) => void;
  tagColors?: Record<string, string>;
}) {
  const { t } = useI18n();

  function addTag(name: string) {
    const tag = name.trim();
    if (!tag || value.tags.includes(tag)) return;
    onChange({ tags: [...value.tags, tag] });
    onTagInput("");
  }

  return (
    // Labelled fields, not bare placeholders: a placeholder is the label until
    // you type, and then the field has no label at all.
    <div className={styles.search}>
      <label className={styles.field}>
        <span>{t("common.version")}</span>
        <input value={value.version} onChange={(e) => onChange({ version: e.target.value })} />
      </label>

      <label className={styles.field}>
        <span>{t("detail.requester")}</span>
        <input value={value.requester} onChange={(e) => onChange({ requester: e.target.value })} />
      </label>

      <div className={styles.field}>
        <span>{t("form.tags")}</span>
        <span className={styles.tagFilter}>
          {value.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.tagFilterChip}
              data-active
              style={tagColors[tag] ? { background: tagColors[tag], color: "#fff", borderColor: tagColors[tag] } : undefined}
              onClick={() => onChange({ tags: value.tags.filter((x) => x !== tag) })}
              title={t("form.addTag")}
            >
              {tag} ×
            </button>
          ))}
          {allTags.length > 0 && (
            <>
              <input
                list="tagFilterOptions"
                aria-label={t("form.tags")}
                value={tagInput}
                onChange={(e) => {
                  const v = e.target.value;
                  // Picking a value from the datalist fires change with the full option.
                  if (allTags.includes(v)) addTag(v);
                  else onTagInput(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                }}
              />
              <datalist id="tagFilterOptions">
                {allTags.filter((tag) => !value.tags.includes(tag)).map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </>
          )}
        </span>
      </div>

      <label className={styles.field}>
        <span>{t("form.hourType")}</span>
        <select value={value.hourType} onChange={(e) => onChange({ hourType: e.target.value })}>
          <option value="">{t("filter.any")}</option>
          <option value="HO">{t("form.hoLong")}</option>
          <option value="HNO">{t("form.hnoLong")}</option>
        </select>
      </label>

      {/* One range, not two loose dates: the arrow says they belong together. */}
      <div className={styles.range}>
        <label className={styles.field}>
          <span>{t("filter.from")}</span>
          <input type="date" value={value.from} onChange={(e) => onDates({ from: e.target.value })} />
        </label>
        <span className={styles.rangeArrow} aria-hidden>→</span>
        <label className={styles.field}>
          <span>{t("filter.to")}</span>
          <input type="date" value={value.to} onChange={(e) => onDates({ to: e.target.value })} />
        </label>
      </div>

      {onReset && (
        <button type="button" className={styles.reset} onClick={onReset}>
          {t("detail.reset")}
        </button>
      )}
    </div>
  );
}

/** Does an event pass the text-ish part of a query? Shared so both screens
 *  agree on what "matches" means. */
export function matchesQuery(
  e: { version: string | null; requester: string | null; tags?: string[]; hourType?: string | null; occurredAt: string },
  q: TimelineQuery,
): boolean {
  const version = q.version.trim().toLowerCase();
  const requester = q.requester.trim().toLowerCase();
  if (version && !(e.version ?? "").toLowerCase().includes(version)) return false;
  if (requester && !(e.requester ?? "").toLowerCase().includes(requester)) return false;
  if (q.hourType && e.hourType !== q.hourType) return false;
  if (q.tags.length > 0) {
    const own = new Set(e.tags ?? []);
    if (!q.tags.every((tag) => own.has(tag))) return false;
  }
  const day = e.occurredAt.slice(0, 10);
  if (q.from && day < q.from) return false;
  if (q.to && day > q.to) return false;
  return true;
}
