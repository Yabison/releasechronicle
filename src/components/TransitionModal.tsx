"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeployStatus } from "@prisma/client";
import { commentRequired } from "@/lib/deployWorkflow";
import { useModalDismiss } from "@/lib/useModalDismiss";
import { transitionDeployStatusAction } from "@/app/actions/events";
import { STATUS_META } from "@/lib/deployStatusMeta";
import { useI18n } from "@/i18n/useI18n";
import { actionMessage } from "@/i18n/labels";
import styles from "./TransitionModal.module.css";

export function TransitionModal({
  eventId, to, path, onClose, onDone,
}: {
  eventId: string;
  to: DeployStatus;
  path: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalDismiss(modalRef, onClose, { enabled: !pending });

  const needComment = commentRequired(to);
  const canSubmit = !needComment || comment.trim() !== "";

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await transitionDeployStatusAction({
        eventId, to, comment: comment || undefined, path,
      });
      if (res.ok) {
        onDone();
        router.refresh();
      } else {
        setError(actionMessage(t, res));
      }
    });
  }

  return (
    <div className={styles.overlay} onClick={pending ? undefined : onClose}>
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{t("modal.transitionTitle")} <span style={{ color: STATUS_META[to].color }}>{STATUS_META[to].label}</span></h3>
        <label className={styles.field}>
          {needComment ? t("modal.commentRequired") : t("modal.commentOptional")}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} autoFocus />
        </label>
        {error && (
          <p className={styles.error}>
            {error}
            {error.includes("connexion") && (
              <>
                {" "}
                <a href="/login" className={styles.loginLink}>{t("common.login")}</a>
              </>
            )}
          </p>
        )}
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose} disabled={pending}>{t("common.cancel")}</button>
          <button className={styles.confirm} onClick={submit} disabled={!canSubmit || pending}>
            {pending ? t("common.loading") : t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
