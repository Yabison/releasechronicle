"use client";

import { useI18n, setLocale } from "@/i18n/useI18n";
import { LOCALES } from "@/i18n";

export function LocaleSwitcher() {
  const { locale } = useI18n();
  return (
    <span style={{ display: "inline-flex", gap: 4, fontSize: 12 }}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => l !== locale && setLocale(l)}
          aria-pressed={l === locale}
          style={{
            font: "inherit", cursor: "pointer", border: 0, background: "none",
            padding: 0, textTransform: "uppercase",
            fontWeight: l === locale ? 700 : 400,
            textDecoration: l === locale ? "none" : "underline",
            opacity: l === locale ? 1 : 0.7,
          }}
        >
          {l}
        </button>
      ))}
    </span>
  );
}
