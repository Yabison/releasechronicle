"use client";

import { useTimeFormat } from "@/lib/useTimeFormat";
import { useI18n } from "@/i18n/useI18n";

/** Local-timezone / UTC toggle, styled like the locale switcher next to it. */
export function TimeModeSwitcher() {
  const { mode, setMode } = useTimeFormat();
  const { t } = useI18n();
  const MODES = [
    { value: "local" as const, label: t("time.local") },
    { value: "utc" as const, label: "UTC" },
  ];
  return (
    <span style={{ display: "inline-flex", gap: 4, fontSize: 12 }} title={t("time.switchTitle")}>
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => m.value !== mode && setMode(m.value)}
          aria-pressed={m.value === mode}
          style={{
            font: "inherit", cursor: "pointer", border: 0, background: "none",
            padding: 0,
            fontWeight: m.value === mode ? 700 : 400,
            textDecoration: m.value === mode ? "none" : "underline",
            opacity: m.value === mode ? 1 : 0.7,
          }}
        >
          {m.label}
        </button>
      ))}
    </span>
  );
}
