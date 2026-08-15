import "./globals.css";
import { getSidebarTree } from "@/lib/tree";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/visibility";

export const dynamic = "force-dynamic";
export const metadata = { title: "Release Chronicle" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const tree = await getSidebarTree(session);
  const me = session ? { name: session.name, roles: session.roles, canWrite: canWrite(session) } : null;
  return (
    <html lang="en">
      <body>
        <AppShell tree={tree} me={me}>{children}</AppShell>
      </body>
    </html>
  );
}
