"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/useI18n";
import { THEMES, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "@/lib/theme";
import styles from "./ThemeSwitcher.module.css";

const ICON: Record<Theme, string> = { light: "☀", dark: "☾", system: "◐" };

/**
 * Switching writes the cookie, repaints immediately, then refreshes.
 *
 * The cookie is the source of truth: the root layout reads it and renders
 * data-theme on <html>, which means React owns that attribute. Setting it by
 * hand alone is not enough — the next time the layout renders, React reconciles
 * <html> against the value it last rendered and puts it back. So the DOM write
 * is only there to repaint on the spot, and router.refresh() immediately re-runs
 * the server render so React's own idea of the attribute matches the cookie.
 *
 * refresh() re-renders server components in place; it is not a page reload, so
 * scroll position and client state survive — unlike setLocale, which reloads
 * because the message catalog is chosen at render time.
 */
export function ThemeSwitcher({ current }: { current: Theme }) {
  const { t } = useI18n();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(current);

  function pick(next: Theme) {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
    document.documentElement.dataset.theme = next;
    router.refresh();
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
