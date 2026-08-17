"use client";

import { useI18n } from "@/i18n/useI18n";
import type { LeadIcon } from "@/lib/rowLeadIcon";
import styles from "./RowLeadIcon.module.css";

/**
 * Glyphs are shape-first: release and hotfix share the green of this list, so the
 * check and the bolt have to carry the difference on their own — desaturate the
 * page and the two must still read apart. Danger is a circle where incident is a
 * triangle, for the same reason: "this deployment went wrong" and "this entry is
 * an incident" are different claims and must not look alike.
 */
const GLYPH: Record<LeadIcon, React.ReactNode> = {
  release: <path d="M5 12l5 5L20 7" />,
  hotfix: <path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z" />,
  incident: (
    <>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  maintenance: <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3-3z" />,
  danger: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
};

/**
 * `dangerReason` names what is wrong, so the tooltip says "Danger — incomplete
 * lot rollback" rather than just "Danger". Colour alone never carries meaning
 * here: every state has a label reachable by keyboard and by screen reader.
 */
export function RowLeadIcon({ icon, dangerReason }: { icon: LeadIcon; dangerReason?: string }) {
  const { t } = useI18n();
  const label =
    icon === "danger"
      ? dangerReason
        ? t("leadIcon.dangerWith", { reason: dangerReason })
        : t("leadIcon.danger")
      : t(`leadIcon.${icon}`);

  return (
    <span className={styles.icon} data-icon={icon} role="img" aria-label={label} title={label} tabIndex={0}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        {GLYPH[icon]}
      </svg>
    </span>
  );
}
