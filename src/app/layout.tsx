import "./globals.css";
import { getSidebarTree } from "@/lib/tree";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/visibility";
import { getLocale } from "@/i18n/server";
import { I18nProvider } from "@/i18n/I18nProvider";

export const dynamic = "force-dynamic";
export const metadata = { title: "Release Chronicle" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const tree = await getSidebarTree(session);
  const me = session ? { name: session.name, roles: session.roles, canWrite: canWrite(session) } : null;
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale}>
          <AppShell tree={tree} me={me}>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
