import { cookies } from "next/headers";
import { LOCALE_COOKIE, getMessages, translate, localeFromCookieValue, type Locale } from "./index";

/** The visitor's locale, read from the cookie — for server components. */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  return localeFromCookieValue(jar.get(LOCALE_COOKIE)?.value);
}

/** A `t()` for server components (e.g. the /go/[token] page). */
export async function getServerT(): Promise<(key: string, vars?: Record<string, string | number>) => string> {
  const messages = getMessages(await getLocale());
  return (key, vars) => translate(messages, key, vars);
}
