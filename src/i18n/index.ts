import fr from "./fr.json";
import en from "./en.json";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "rc_locale";

export type Messages = Record<string, string>;

const CATALOGS: Record<Locale, Messages> = { fr, en };

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

/** Message catalog for a locale (falls back to the default locale). */
export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}

/** Translate a key against a catalog, interpolating {var} placeholders.
 *  Missing keys fall back to the default-locale catalog, then to the key itself. */
export function translate(messages: Messages, key: string, vars?: Record<string, string | number>): string {
  const raw = messages[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Pick a locale from a raw cookie header/string value. */
export function localeFromCookieValue(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
