import type { TreeCompany } from "@/lib/tree";
import type { UserPreferences } from "@/lib/userPreferences";
import { Sidebar, type Me } from "./Sidebar";
import styles from "./AppShell.module.css";

export function AppShell({ tree, me, preferences, children }: { tree: TreeCompany[]; me: Me; preferences: UserPreferences; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Sidebar tree={tree} me={me} preferences={preferences} />
      </aside>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
