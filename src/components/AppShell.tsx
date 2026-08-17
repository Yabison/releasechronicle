import type { TreeCompany } from "@/lib/tree";
import type { Theme } from "@/lib/theme";
import { Sidebar, type Me } from "./Sidebar";
import styles from "./AppShell.module.css";

export function AppShell({ tree, me, theme, children }: { tree: TreeCompany[]; me: Me; theme: Theme; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Sidebar tree={tree} me={me} theme={theme} />
      </aside>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
