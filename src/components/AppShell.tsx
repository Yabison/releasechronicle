import type { TreeCompany } from "@/lib/tree";
import { Sidebar, type Me } from "./Sidebar";
import styles from "./AppShell.module.css";

export function AppShell({ tree, me, children }: { tree: TreeCompany[]; me: Me; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Sidebar tree={tree} me={me} />
      </aside>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
