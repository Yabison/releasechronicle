"use client";

import { useRef, type ReactNode } from "react";
import { useModalDismiss } from "@/lib/useModalDismiss";
import { useI18n } from "@/i18n/useI18n";
import styles from "./EventModal.module.css";

/**
 * The one centered dialog: overlay, panel, title, close button, and the full
 * accessibility contract (role/aria, focus on open, Tab trap, Escape, focus
 * restored to the opener on close) in a single place.
 *
 * Clicking the overlay does NOT close it. These dialogs hold forms, and an
 * accidental click outside used to discard everything typed; Escape and the ×
 * button are the two deliberate ways out.
 */
export function Modal({
  title,
  onClose,
  children,
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Block Escape/× while a submit is in flight. */
  closeDisabled?: boolean;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalDismiss(panelRef, onClose, { enabled: !closeDisabled });
  return (
    <div className={styles.overlay}>
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label={title}>
        <button className={styles.close} onClick={onClose} disabled={closeDisabled} aria-label={t("common.close")}>×</button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
