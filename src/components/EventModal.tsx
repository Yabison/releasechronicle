"use client";

import { EventForm, type MepCandidate } from "./EventForm";
import { useI18n } from "@/i18n/useI18n";
import styles from "./EventModal.module.css";

export function EventModal({
  company,
  product,
  service,
  path,
  onClose,
  mepCandidates = [],
  defaultChangeType,
  defaultParentId,
  defaultEnvironment,
  parentOccurredAt,
  title,
}: {
  company: string;
  product: string;
  service: string;
  path: string;
  onClose: () => void;
  mepCandidates?: MepCandidate[];
  defaultChangeType?: string;
  defaultParentId?: string;
  defaultEnvironment?: string;
  parentOccurredAt?: string;
  title?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label={t("common.close")}>×</button>
        <h2>{title ?? t("form.newEvent")}</h2>
        <EventForm
          company={company}
          product={product}
          service={service}
          path={path}
          onSuccess={onClose}
          mepCandidates={mepCandidates}
          defaultChangeType={defaultChangeType}
          defaultParentId={defaultParentId}
          defaultEnvironment={defaultEnvironment}
          parentOccurredAt={parentOccurredAt}
        />
      </div>
    </div>
  );
}
