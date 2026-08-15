"use client";

import { useState } from "react";
import { DeployStatus } from "@prisma/client";
import type { ClientEvent } from "@/lib/timeline";
import { stepStates } from "@/lib/deployTimeline";
import { STATUS_META, ROLLBACK_COLOR } from "@/lib/deployStatusMeta";
import { previousStatus, DEPLOY_ORDER } from "@/lib/deployWorkflow";
import { TransitionModal } from "./TransitionModal";
import { RollbackModal } from "./RollbackModal";
import { UndoModal } from "./UndoModal";
import styles from "./DeployTimeline.module.css";
import { useI18n } from "@/i18n/useI18n";
import { rollbackText } from "@/i18n/labels";

function stamp(iso: string): string {
  const d = new Date(iso);
  return d.toUTCString();
}

/** Human-friendly status labels for the stepper (STATUS_META keeps the raw enum names). */
const STATUS_LABEL: Record<DeployStatus, string> = {
  SCHEDULED: "Scheduled",
  GO_CONFIRMED: "GO MEP",
  PENDING: "Pending",
  IN_PROGRESS: "In-progress",
  DEPLOYED: "Deployed",
  TESTING: "Testing",
  VALIDATE: "Validate",
};

type HistItem =
  | { id: string; at: string; kind: "transition"; from: string | null; to: string; who: string | null; comment: string | null }
  | { id: string; at: string; kind: "rollback"; comment: string | null; previousVersion: string | null; actorName: string | null };

export function DeployTimeline({ event, path, canWrite = true }: { event: ClientEvent; path: string; canWrite?: boolean }) {
  const [target, setTarget] = useState<DeployStatus | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { t } = useI18n();
  const steps = stepStates((event.deployStatus as DeployStatus | null) ?? null);
  const current = (event.deployStatus as DeployStatus | null) ?? null;
  const hasPrevious = current != null && previousStatus(current) != null;

  // Nodes: [Annuler] + the 7 statuses + [Rollback], laid out 4 then 5.
  // Annuler (grey) and Rollback (red) are actions, detached from the status line.
  type Node =
    | { kind: "undo" }
    | { kind: "status"; status: DeployStatus; state: (typeof steps)[number]["state"] }
    | { kind: "rollback" };
  // Read-only visitors get the status stepper without the undo/rollback action nodes.
  const nodes: Node[] = [
    ...(canWrite ? [{ kind: "undo" as const }] : []),
    ...steps.map((s) => ({ kind: "status" as const, status: s.status, state: s.state })),
    ...(canWrite ? [{ kind: "rollback" as const }] : []),
  ];
  const half = Math.ceil(nodes.length / 2);
  const nodeRows = [nodes.slice(0, half), nodes.slice(half)];

  // Transition that reached each status (for the hover tooltip: date + comment).
  const txByStatus = new Map<string, { createdAt: string; comment: string | null }>();
  for (const t of event.statusTransitions) txByStatus.set(t.toStatus, { createdAt: t.createdAt, comment: t.comment });
  const statusTitle = (status: DeployStatus): string => {
    const tx = txByStatus.get(status);
    if (!tx) return `${STATUS_LABEL[status]} — ${t("deploy.notReached")}`;
    return `${STATUS_LABEL[status]} — ${stamp(tx.createdAt)}${tx.comment ? ` · ${tx.comment}` : ""}`;
  };

  // Status transitions and rollbacks share one chronological history.
  const history: HistItem[] = [
    ...event.statusTransitions.map((t) => ({
      id: t.id, at: t.createdAt, kind: "transition" as const,
      from: t.fromStatus, to: t.toStatus, who: t.actorName, comment: t.comment,
    })),
    ...event.rollbacks.map((r) => ({
      id: `rb:${r.id}`, at: r.createdAt, kind: "rollback" as const,
      comment: r.comment, previousVersion: r.previousVersion, actorName: r.actorName,
    })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return (
    <div className={styles.wrap}>
      <div className={styles.wfHead}>
        <h2 className={styles.wfTitle}>{t("common.status")}</h2>
        {history.length > 0 && (
          <button type="button" className={styles.detailsToggle} onClick={() => setShowDetails((v) => !v)}>
            {t("deploy.details")} {showDetails ? "▲" : "▼"}
          </button>
        )}
      </div>
      {/* Row 1: Annuler · Scheduled · GO MEP · Pending — Row 2: In-progress · Deployed · Testing · Validate · Rollback.
          Annuler (grey) and Rollback (red) are detached actions (no connector). */}
      {nodeRows.map((row, ri) => (
        <div key={ri} className={styles.stepperRow}>
          {row.map((node, i) => {
            const next = row[i + 1];
            const connect = node.kind === "status" && next?.kind === "status";
            if (node.kind === "undo") {
              return (
                <div key="undo" className={styles.step}>
                  <button
                    className={styles.dot}
                    style={{ background: "#e2e8f0", color: hasPrevious ? "#475569" : "#cbd5e1" }}
                    disabled={!hasPrevious}
                    onClick={() => hasPrevious && setUndoing(true)}
                    aria-label={t("deploy.cancel")}
                  >↺</button>
                  <span className={styles.lbl}>{t("deploy.cancel")}</span>
                </div>
              );
            }
            if (node.kind === "rollback") {
              return (
                <div key="rollback" className={styles.step}>
                  <button
                    className={styles.dot}
                    style={{ background: ROLLBACK_COLOR, color: "#fff" }}
                    onClick={() => setRollingBack(true)}
                    aria-label={t("modal.rollbackTitle")}
                  >↩</button>
                  <span className={styles.lbl} style={{ color: ROLLBACK_COLOR }}>{t("modal.rollbackTitle")}</span>
                </div>
              );
            }
            const { status, state } = node;
            const meta = STATUS_META[status];
            const filled = state === "done" || state === "current";
            const isNext = state === "next";
            const dotColor = filled || isNext ? meta.color : "#e2e8f0";
            return (
              <div key={status} className={styles.step} data-state={state} title={statusTitle(status)}>
                {connect && <span className={styles.connector} style={{ background: filled ? meta.color : "#e2e8f0" }} />}
                <button
                  className={styles.dot}
                  style={{ background: dotColor, color: filled || isNext ? "#fff" : "#94a3b8" }}
                  disabled={!isNext || !canWrite}
                  onClick={() => isNext && canWrite && setTarget(status)}
                  aria-label={isNext ? t("deploy.advanceTo", { status: STATUS_LABEL[status] }) : STATUS_LABEL[status]}
                  title={statusTitle(status)}
                >
                  {state === "done" ? "✓" : state === "current" ? "●" : isNext ? "→" : "★"}
                </button>
                <span className={styles.lbl} style={{ color: isNext ? meta.color : undefined, opacity: state === "future" ? 0.45 : 1 }}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {showDetails && history.length > 0 && (
        <div className={styles.history}>
          <h4 className={styles.historyTitle}>{t("deploy.history")}</h4>
          {history.map((h) => (
            <div key={h.id} className={styles.histRow}>
              <span className={styles.histWhen}>{stamp(h.at)}</span>
              {h.kind === "transition" ? (
                <>
                  {(() => {
                    const isUndo = h.from != null && DEPLOY_ORDER.indexOf(h.to as DeployStatus) < DEPLOY_ORDER.indexOf(h.from as DeployStatus);
                    return (
                      <span className={styles.histMove} style={isUndo ? { color: "#f59e0b" } : undefined}>
                        {isUndo ? t("deploy.undone") : ""}{h.from ?? "—"} → {h.to}
                      </span>
                    );
                  })()}
                  <span className={styles.histWho}>{h.who ?? t("tx.creation")}</span>
                  {h.comment && <span className={styles.histComment}>{h.comment}</span>}
                </>
              ) : (
                <>
                  <span className={styles.histMove} style={{ color: ROLLBACK_COLOR }}>↩ Rollback</span>
                  <span className={styles.histComment}>{rollbackText(t, h)}</span>
                  {h.actorName && <span className={styles.histWho}>{t("common.byActor", { who: h.actorName })}</span>}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {target && (
        <TransitionModal
          eventId={event.id} to={target} path={path}
          onClose={() => setTarget(null)} onDone={() => setTarget(null)}
        />
      )}
      {rollingBack && (
        <RollbackModal
          eventId={event.id} path={path}
          onClose={() => setRollingBack(false)} onDone={() => setRollingBack(false)}
        />
      )}
      {undoing && (
        <UndoModal
          eventId={event.id} path={path}
          onClose={() => setUndoing(false)} onDone={() => setUndoing(false)}
        />
      )}
    </div>
  );
}
