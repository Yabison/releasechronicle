import { cookies } from "next/headers";
import { THEME_COOKIE, themeFromCookieValue, type Theme } from "./theme";

/** The visitor's theme, read from the cookie — for server components.
 *  Kept apart from theme.ts so the pure module stays importable from anywhere,
 *  the same split as src/i18n/index.ts and src/i18n/server.ts. */
export async function getTheme(): Promise<Theme> {
  const jar = await cookies();
  return themeFromCookieValue(jar.get(THEME_COOKIE)?.value);
}
