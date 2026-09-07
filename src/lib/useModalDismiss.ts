"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal accessibility: on mount focus the first focusable element inside `ref`,
 * close on Escape (unless disabled, e.g. while a submit is pending), trap Tab
 * focus within the container, and give focus back to whatever opened the modal
 * when it closes — without the restore, a keyboard user lands back at the top of
 * the page after every dialog.
 */
export function useModalDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: { enabled?: boolean } = {},
): void {
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = el.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    (first ?? el).focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (enabled) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = el.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const a = items[0];
      const b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus only if it is still inside the (now unmounting) modal;
      // if the user already clicked elsewhere, respect that.
      if (opener && (document.activeElement === document.body || el.contains(document.activeElement))) {
        opener.focus();
      }
    };
  }, [ref, onClose, enabled]);
}
