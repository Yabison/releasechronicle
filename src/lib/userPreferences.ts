import { prisma } from "@/lib/db";
import { isLocale, type Locale } from "@/i18n";
import { isTheme, type Theme } from "@/lib/theme";
import { isTimeMode } from "@/lib/timeMode";
import type { TimeMode } from "@/lib/dateDisplay";

/**
 * Per-user preferences.
 *
 * The cookies still carry theme and locale into the render — an anonymous
 * visitor has no row here, and reading the database on every request to paint
 * the first frame would be a query for a colour. This table is what makes a
 * signed-in user's choice follow them to another machine: it is written when
 * they save, and read back into the cookies when they sign in.
 */

export type UserPreferences = {
  locale: Locale | null;
  theme: Theme | null;
  timeMode: TimeMode | null;
  homePath: string | null;
  homeQuery: string | null;
};

export const EMPTY_PREFERENCES: UserPreferences = { locale: null, theme: null, timeMode: null, homePath: null, homeQuery: null };

/**
 * A landing path is user input that ends up in a redirect, so it may only ever
 * be a path on this site: it must start with a single "/" and carry no scheme,
 * no host and no protocol-relative "//" prefix, which would send the user
 * somewhere else entirely.
 */
export function isSafeHomePath(value: string): boolean {
  return /^\/(?!\/)[\w\-./]*$/.test(value) && !value.includes("..");
}

/** A pinned search: the query string alone, without its leading "?". */
export function isSafeHomeQuery(value: string): boolean {
  return value.length <= 512 && !/[\s#]/.test(value);
}

/** Keep only what is valid; anything else is dropped rather than stored. */
export function sanitize(input: Partial<Record<keyof UserPreferences, unknown>>): UserPreferences {
  const path = typeof input.homePath === "string" ? input.homePath.trim() : "";
  const query = typeof input.homeQuery === "string" ? input.homeQuery.trim().replace(/^\?/, "") : "";
  return {
    locale: isLocale(input.locale) ? input.locale : null,
    theme: isTheme(input.theme) ? input.theme : null,
    timeMode: isTimeMode(input.timeMode) ? input.timeMode : null,
    homePath: path && isSafeHomePath(path) ? path : null,
    // A query without a path has nothing to pin itself to.
    homeQuery: path && isSafeHomePath(path) && query && isSafeHomeQuery(query) ? query : null,
  };
}

export async function getUserPreferences(username: string): Promise<UserPreferences> {
  const row = await prisma.userPreference.findUnique({ where: { username } });
  if (!row) return EMPTY_PREFERENCES;
  return sanitize(row);
}

export async function saveUserPreferences(username: string, input: Partial<UserPreferences>): Promise<UserPreferences> {
  const clean = sanitize(input);
  await prisma.userPreference.upsert({
    where: { username },
    create: { username, ...clean },
    update: clean,
  });
  return clean;
}

/** The full landing target, or null when the user has not chosen one. */
export function homeTarget(prefs: UserPreferences): string | null {
  // "/" is what the app does without a preference; storing it as a target would
  // make the home page redirect to itself.
  if (!prefs.homePath || prefs.homePath === "/") return null;
  return prefs.homeQuery ? `${prefs.homePath}?${prefs.homeQuery}` : prefs.homePath;
}
