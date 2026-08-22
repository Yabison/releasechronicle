"use client";

import { useI18n } from "@/i18n/useI18n";
import { categoryLabel, changeTypeLabel } from "@/i18n/labels";
import { FILTER_KEYS, type FilterKey } from "@/lib/timelineFilter";
import styles from "./CategoryFilter.module.css";

/**
 * The six category chips, shared by the service page and the dashboards.
 *
 * One component rather than the same markup twice: the two screens had drifted
 * apart once already — four categories on the dashboards against six here — and
 * a reader moving between them found the same list filtered by different words.
 */
export function CategoryFilter({
  active,
  onToggle,
}: {
  active: Set<FilterKey>;
  onToggle: (key: FilterKey) => void;
}) {
  const { t } = useI18n();
  const label = (key: FilterKey) =>
    key === "PRE" || key === "POST" ? changeTypeLabel(t, `${key}_MEP`) : categoryLabel(t, key);

  return (
    <div className={styles.filters}>
      <span className={styles.label}>{t("detail.filter")}</span>
      {FILTER_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          data-active={active.has(key)}
          data-cat={key}
          aria-pressed={active.has(key)}
          onClick={() => onToggle(key)}
        >
          {active.has(key) && <span className={styles.check} aria-hidden>✓</span>}
          {label(key)}
        </button>
      ))}
    </div>
  );
}
