"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { THEMES, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "@/lib/theme";
import styles from "./ThemeSwitcher.module.css";

const ICON: Record<Theme, string> = { light: "☀", dark: "☾", system: "◐" };

/**
 * Unlike the locale, switching theme does not reload: the tokens live in CSS, so
 * setting the attribute on <html> repaints everything on the spot. The cookie is
 * written for the next server render, which is what keeps the first paint right.
 */
export function ThemeSwitcher({ current }: { current: Theme }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(current);

  function pick(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }

  return (
    <span className={styles.group} role="group" aria-label={t("theme.label")}>
      {THEMES.map((value) => (
        <button
          key={value}
          type="button"
          className={styles.option}
          onClick={() => value !== theme && pick(value)}
          aria-pressed={value === theme}
          title={t(`theme.${value}`)}
        >
          <span aria-hidden>{ICON[value]}</span>
          <span className={styles.srOnly}>{t(`theme.${value}`)}</span>
        </button>
      ))}
    </span>
  );
}
