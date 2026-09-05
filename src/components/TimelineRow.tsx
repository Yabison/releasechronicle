import { entrySeverity, type TimelineEntry } from "@/lib/eventTimeline";
import { rowLeadIcon } from "@/lib/rowLeadIcon";
import { RowLeadIcon } from "./RowLeadIcon";
import { categoryLabel, changeTypeLabel, phaseLabel, deployStatusLongLabel, releaseIssueLabel } from "@/i18n/labels";
import type { ReleaseIssue } from "@/lib/releaseTrace";
import { STATUS_TEXT_VAR } from "@/lib/deployStatusMeta";
import type { DeployStatus } from "@prisma/client";
import { LotBadge } from "./LotBadge";
import type { LotMember } from "@/lib/deployLot";
import { formatDuration } from "@/lib/duration";
import styles from "./DetailPane.module.css";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";

/**
 * One row of the service timeline, laid out on the seven fixed tracks declared
 * by `.row`: lead icon, when, environment, version, type, status, meta.
 *
 * Every cell is rendered even when empty. A conditional cell would shift every
 * track after it and the columns would stop lining up between rows, which is
 * the whole reason this is a grid.
 */
export function TimelineRow({
  entry,
  onClick,
  lotMembers = [],
  lotWarning = [],
  envColor = null,
  tagColors = {},
  context = null,
  workflowIssues = [],
}: {
  entry: TimelineEntry;
  onClick: () => void;
  lotMembers?: LotMember[];
  lotWarning?: string[];
  envColor?: string | null;
  tagColors?: Record<string, string>;
  /** "product / service", shown on the dashboards where one list spans many
   *  services and the row would otherwise not say what it belongs to. */
  context?: string | null;
  /** Env-workflow violations of this build (see workflowIssuesByEvent); empty when
   *  the release went through the environments in the expected order. */
  workflowIssues?: ReleaseIssue[];
}) {
  const { t } = useI18n();
  const { stampDay, stampTime, dayKey } = useTimeFormat();
  const sev = entrySeverity(entry);
  const lotIncomplete = lotWarning.length > 0;
  const leadIcon = rowLeadIcon({
    category: entry.category,
    deployStatus: entry.deployStatus ?? null,
    hasRollback: Boolean(entry.rolledBack),
    lotIncomplete,
  });
  // Named so the tooltip says what is wrong, not merely that something is.
  const dangerReason = entry.rolledBack
    ? t("leadIcon.reasonRollback")
    : lotIncomplete
      ? t("leadIcon.reasonLotIncomplete")
      : undefined;
  const status = (entry.deployStatus ?? null) as DeployStatus | null;
  // A build that skipped an env or reached one too early. Marked beside the
  // status and tagged: the problem is about the package as much as about this
  // deployment.
  const workflowBroken = workflowIssues.length > 0;
  const workflowTitle = workflowBroken
    ? t("timeline.workflowErrorTitle", { issues: workflowIssues.map((i) => releaseIssueLabel(t, i)).join(" ; ") })
    : undefined;
  const workflowMark = workflowBroken && (
    <span className={styles.sevIcon} data-sev="danger" role="img" aria-label={workflowTitle} title={workflowTitle}>
      ⚠
    </span>
  );

  return (
    <button className={styles.row} onClick={onClick} data-done={entry.done} data-rolledback={entry.rolledBack}>
      <span className={styles.lead}>
        <RowLeadIcon icon={leadIcon} dangerReason={dangerReason} />
      </span>

      <span className={styles.stamp}>
        <span className={styles.stampLine}>
          <span className={styles.stampDay}>{stampDay(entry.at)}</span>
          <span>{stampTime(entry.at)}</span>
          {/* Out-of-hours is a property of *when* it ran, so it sits with the
              time rather than off in the trailing metadata. */}
          {entry.hourType === "HNO" && (
            /* A filled crescent, not the ☾ character: the text glyph rendered as
               a hairline outline that vanished at 13px next to the timestamp. */
            <span className={styles.hnoBadge} title={t("timeline.hno")} role="img" aria-label={t("timeline.hno")}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M21 14.2A9 9 0 1 1 9.8 3 7.2 7.2 0 0 0 21 14.2z" />
              </svg>
            </span>
          )}
        </span>
        {entry.done && entry.endAt && (
          <span className={`${styles.stampLine} ${styles.endAt}`}>
            <span className={styles.stampDay}>{dayKey(entry.at) === dayKey(entry.endAt) ? "" : stampDay(entry.endAt)}</span>
            <span>{stampTime(entry.endAt)}</span>
          </span>
        )}
        {entry.durationMs != null && (
          <span className={`${styles.stampLine} ${styles.endAt}`} title={t("timeline.durationTitle")}>
            <span>⏱ {formatDuration(entry.durationMs)}</span>
          </span>
        )}
      </span>

      <span className={styles.envCell}>
        {envColor && (
          <span className={styles.envBadge} style={{ background: envColor }}>
            {entry.environment}
          </span>
        )}
      </span>

      <span className={styles.version}>{entry.version ? `v${entry.version}` : ""}</span>

      <span className={styles.typeCell}>
        <span className={styles.typeBadge} data-cat={entry.category}>
          {entry.phase ? changeTypeLabel(t, `${entry.phase}_MEP`) : categoryLabel(t, entry.category)}
        </span>
      </span>

      {/* Lot marker, then the status in words and in its own colour, then any
          alert on its own line beneath. A rollback replaces the status wording
          rather than sitting beside it: "DEPLOYED + rollback" reads as a
          contradiction, "Échec - Rollback" is what actually happened. */}
      <span className={styles.statusCell}>
        <span className={styles.statusLine}>
          {entry.deployStatus && lotMembers.length > 0 && <LotBadge members={lotMembers} />}
          {entry.rolledBack ? (
            <span className={styles.statusText} style={{ color: "var(--danger)" }}>
              {t("timeline.failedRollback")}
            </span>
          ) : (
            status && (
              <span className={styles.statusText} style={{ color: STATUS_TEXT_VAR[status] }}>
                {deployStatusLongLabel(t, status)}
              </span>
            )
          )}
          {sev === "orange" && (
            <span
              className={styles.sevIcon}
              data-sev={sev}
              role="img"
              aria-label={t("timeline.sevWarning")}
              title={t("timeline.sevWarning")}
            >
              ⚠
            </span>
          )}
          {workflowMark}
        </span>
        {(entry.warnPre || lotIncomplete) && (
          <span className={styles.statusLine}>
            {entry.warnPre && (
              <span className={styles.alert} data-level="warning" title={t("timeline.warnPreTitle")}>
                ⚠ {phaseLabel(t, "PRE")}
              </span>
            )}
            {lotIncomplete && (
              <span
                className={styles.alert}
                data-level="danger"
                title={t("timeline.lotIncompleteTitle", { apps: lotWarning.join(", ") })}
              >
                ⚠ {t("timeline.lotIncomplete")}
              </span>
            )}
          </span>
        )}
        <span className={styles.title}>
          {context && <span className={styles.rowCtx}>{context} · </span>}
          {entry.title}
        </span>
      </span>

      <span className={styles.meta}>
        {(workflowBroken || (entry.tags && entry.tags.length > 0)) && (
          <span className={styles.tags}>
            {workflowBroken && (
              <span className={styles.tag} data-level="danger" title={workflowTitle}>
                {t("timeline.workflowError")}
              </span>
            )}
            {(entry.tags ?? []).map((tag) => (
              <span
                key={tag}
                className={styles.tag}
                style={tagColors[tag] ? { background: tagColors[tag], color: "#fff", borderColor: tagColors[tag] } : undefined}
              >
                {tag}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
