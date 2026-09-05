"use client";

import { createContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./index";

/**
 * Carries the locale the SERVER read from the cookie down to client components.
 *
 * Before this, useI18n started every render at the French default and read the
 * cookie in an effect, so an English user got a French first paint on every
 * navigation — and the server HTML disagreed with the client's second render.
 * With the server as the single source, both sides render the same locale from
 * the first frame.
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
