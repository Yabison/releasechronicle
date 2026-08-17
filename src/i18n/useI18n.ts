"use client";

import { useCallback, useContext } from "react";
import { LOCALE_COOKIE, getMessages, translate } from "./index";
import { LocaleContext } from "./I18nProvider";
import type { Locale } from "./index";

/** Client-side i18n: the server-provided locale + a `t()` bound to its catalog. */
export function useI18n() {
  const locale = useContext(LocaleContext);
  const messages = getMessages(locale);
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(messages, key, vars),
    [messages],
  );
  return { locale, t };
}

/** Persist the locale to the cookie (1 year) and reload so server components re-render. */
export function setLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.location.reload();
}
