"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, getMessages, translate, localeFromCookieValue, type Locale } from "./index";

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  return localeFromCookieValue(match ? decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1)) : null);
}

/** Client-side i18n: current locale + a `t()` bound to its catalog. */
export function useI18n() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => { setLocale(readLocaleCookie()); }, []);
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
