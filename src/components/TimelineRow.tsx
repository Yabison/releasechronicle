import { entrySeverity, type TimelineEntry } from "@/lib/eventTimeline";
import { categoryLabel, changeTypeLabel, phaseLabel } from "@/i18n/labels";
import { STATUS_META, ROLLBACK_COLOR } from "@/lib/deployStatusMeta";
import type { DeployStatus } from "@prisma/client";
import { LotBadge } from "./LotBadge";
import type { LotMember } from "@/lib/deployLot";
import { formatDuration } from "@/lib/duration";
import styles from "./DetailPane.module.css";
import { useI18n } from "@/i18n/useI18n";

function stampParts(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

export function TimelineRow({
  entry,
  onClick,
  lotMembers = [],
  lotWarning = [],
  envColor = null,
  tagColors = {},
}: {
  entry: TimelineEntry;
  onClick: () => void;
  lotMembers?: LotMember[];
  lotWarning?: string[];
  envColor?: string | null;
  tagColors?: Record<string, string>;
}) {
  const { t } = useI18n();
  const sev = entrySeverity(entry);
  return (
    <button className={styles.row} onClick={onClick} data-done={entry.done} data-rolledback={entry.rolledBack}>
      <span className="catDot" data-cat={entry.category} />
      {sev && (
        <span
          className={styles.sevIcon}
          data-sev={sev}
          role="img"
          aria-label={sev === "red" ? t("timeline.sevError") : t("timeline.sevWarning")}
          title={sev === "red" ? t("timeline.sevError") : t("timeline.sevWarning")}
        >
          ⚠
        </span>
      )}
      <span className={styles.stamp}>
        <span className={styles.stampLine}>
          <span className={styles.stampDay}>{stampParts(entry.at).day}</span>
          <span>{stampParts(entry.at).time}</span>
        </span>
        {entry.done && entry.endAt && (
          <span className={`${styles.stampLine} ${styles.endAt}`}>
            <span className={styles.stampDay}>{sameDay(entry.at, entry.endAt) ? "" : stampParts(entry.endAt).day}</span>
            <span>{stampParts(entry.endAt).time}</span>
          </span>
        )}
        {entry.durationMs != null && (
          <span className={`${styles.stampLine} ${styles.endAt}`} title={t("timeline.durationTitle")}>
            <span>⏱ {formatDuration(entry.durationMs)}</span>
          </span>
        )}
      </span>
      {envColor && (
        <span className={styles.envBadge} style={{ background: envColor }}>
          {entry.environment}
        </span>
      )}
      <span className={styles.version}>{entry.version ? `v${entry.version}` : ""}</span>
      <span className="catBadge" data-cat={entry.category}>
        {entry.phase ? changeTypeLabel(t, `${entry.phase}_MEP`) : categoryLabel(t, entry.category)}
      </span>
      {entry.hourType === "HNO" && (
        <span className={styles.hnoBadge} title={t("timeline.hno")} aria-label="HNO">☾</span>
      )}
      {entry.deployStatus && (
        <span
          className="deployPill"
          style={{ background: STATUS_META[entry.deployStatus as DeployStatus].color }}
        >
          {STATUS_META[entry.deployStatus as DeployStatus].label}
        </span>
      )}
      {entry.rolledBack && (
        <span className="deployPill" style={{ background: ROLLBACK_COLOR }}>{t("timeline.rollback")}</span>
      )}
      {entry.warnPre && <span className="deployPill" style={{ background: "#f59e0b" }} title={t("timeline.warnPreTitle")}>⚠ {phaseLabel(t, "PRE")}</span>}
      {entry.deployStatus && lotMembers.length > 0 && <LotBadge members={lotMembers} />}
      {lotWarning.length > 0 && (
        <span
          className="deployPill"
          style={{ background: "#dc2626" }}
          title={t("timeline.lotIncompleteTitle", { apps: lotWarning.join(", ") })}
        >
          {t("timeline.lotIncomplete")}
        </span>
      )}
      <span className={styles.title}>{entry.title}</span>
      {entry.tags && entry.tags.length > 0 && (
        <span className={styles.tags}>
          {entry.tags.map((t) => (
            <span key={t} className={styles.tag} style={tagColors[t] ? { background: tagColors[t], color: "#fff", borderColor: tagColors[t] } : undefined}>{t}</span>
          ))}
        </span>
      )}
    </button>
  );
}
