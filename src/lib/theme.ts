/**
 * Colour theme, stored in a cookie and stamped on <html> by the server.
 *
 * Server-rendered on purpose: reading the cookie in a client effect would paint
 * the light theme first and swap on the second frame, which is the white flash
 * every hand-rolled dark mode is known for. The same reasoning as the locale —
 * see src/i18n/I18nProvider.tsx.
 *
 * "system" is a stored value, not the absence of one: the CSS needs a concrete
 * attribute to hang `@media (prefers-color-scheme: dark)` off, and a visitor who
 * deliberately picked "follow my OS" is saying something an empty cookie does not.
 */

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";
export const THEME_COOKIE = "rc_theme";

/** One year, matching the locale cookie. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(x: unknown): x is Theme {
  return typeof x === "string" && (THEMES as readonly string[]).includes(x);
}

/** Pick a theme from a raw cookie value; anything unknown falls back. */
export function themeFromCookieValue(value: string | null | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
