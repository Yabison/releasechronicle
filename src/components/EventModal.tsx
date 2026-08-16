"use client";

import { EventForm, type MepCandidate } from "./EventForm";
import { Modal } from "./Modal";
import { useI18n } from "@/i18n/useI18n";

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
    <Modal title={title ?? t("form.newEvent")} onClose={onClose}>
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
    </Modal>
  );
}
