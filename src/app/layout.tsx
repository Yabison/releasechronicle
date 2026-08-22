import "./globals.css";
import { getSidebarTree } from "@/lib/tree";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/visibility";
import { getLocale } from "@/i18n/server";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getTheme } from "@/lib/theme.server";
import { getUserPreferences, EMPTY_PREFERENCES } from "@/lib/userPreferences";

export const dynamic = "force-dynamic";
export const metadata = { title: "Release Chronicle" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, locale, theme] = await Promise.all([getSession(), getLocale(), getTheme()]);
  const tree = await getSidebarTree(session);
  const me = session
    ? {
        name: session.name,
        roles: session.roles,
        canWrite: canWrite(session),
        // Which provider owns the credentials decides whether a password can be
        // changed here at all.
        provider: (process.env.AUTH_PROVIDER === "ldap" ? "ldap" : "local") as "local" | "ldap",
      }
    : null;
  const preferences = session ? await getUserPreferences(session.sub) : EMPTY_PREFERENCES;
  return (
    // data-theme is stamped here, server-side, so the first paint is already the
    // right theme — no flash of light before a client effect catches up.
    <html lang={locale} data-theme={theme}>
      <body>
        <I18nProvider locale={locale}>
          <AppShell tree={tree} me={me} preferences={preferences}>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
