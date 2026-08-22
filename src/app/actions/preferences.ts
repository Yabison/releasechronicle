"use server";

import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/i18n";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/theme";
import { saveUserPreferences, type UserPreferences } from "@/lib/userPreferences";

/**
 * Save the signed-in user's preferences, and mirror theme and locale into the
 * cookies the renderer actually reads.
 *
 * Both halves matter: the row is what follows the user to another machine, the
 * cookies are what the server reads on the next request without a query. A
 * server action is an ordinary POST endpoint, so the session is checked here
 * rather than trusted from the caller.
 */
export async function savePreferencesAction(
  input: Partial<UserPreferences>,
): Promise<{ ok: true; preferences: UserPreferences } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "err.loginRequired" };

  const preferences = await saveUserPreferences(session.sub, input);

  const jar = await cookies();
  const opts = { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "lax" as const };
  if (preferences.locale) jar.set(LOCALE_COOKIE, preferences.locale, opts);
  if (preferences.theme) jar.set(THEME_COOKIE, preferences.theme, opts);

  return { ok: true, preferences };
}
