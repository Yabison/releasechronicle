"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeCompany } from "@/lib/tree";
import { useI18n } from "@/i18n/useI18n";
import { APP_NAME, APP_VERSION } from "@/lib/appMeta";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { TimeModeSwitcher } from "./TimeModeSwitcher";
import styles from "./Sidebar.module.css";

export type Me = { name: string; roles: string[]; canWrite: boolean } | null;

export function Sidebar({ tree, me }: { tree: TreeCompany[]; me: Me }) {
  const { t } = useI18n();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className={styles.brandLogo} aria-hidden />
        <span className={styles.brandName}>{APP_NAME}</span>
        <span className={styles.brandVersion}>v{APP_VERSION}</span>
      </div>
      <div className={styles.identity}>
        {me ? (
          <span className={styles.identityUser}>
            <span className={styles.userIcon} aria-hidden>
              👤
            </span>
            <span className={styles.userName}>{me.name}</span>
            <button type="button" className={styles.logoutBtn} onClick={logout}>
              {t("nav.logout")}
            </button>
          </span>
        ) : (
          <Link href="/login" className={styles.loginBtn}>
            <span className={styles.userIcon} aria-hidden>
              👤
            </span>{" "}
            {t("nav.login")}
          </Link>
        )}
      </div>
      {tree.map((company) => (
        <div key={company.id} className={styles.company}>
          <Link href={`/${company.slug}`} className={styles.companyName}>{company.name}</Link>
          {company.products.map((product) => (
            <ProductNode
              key={product.id}
              company={company.slug}
              product={product}
            />
          ))}
        </div>
      ))}
      <div className={styles.footer}>
        <Link href="/metrics">{t("nav.metrics")}</Link>
        <a href="/api/docs" target="_blank" rel="noreferrer">
          {t("nav.swagger")}
        </a>
        {me?.canWrite && <Link href="/admin">{t("nav.admin")}</Link>}
        <LocaleSwitcher />
        <TimeModeSwitcher />
      </div>
    </nav>
  );
}

function ProductNode({
  company,
  product,
}: {
  company: string;
  product: TreeCompany["products"][number];
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const prefix = `/${company}/${product.slug}`;
  const [open, setOpen] = useState(pathname.startsWith(prefix));
  const count = product.services.reduce((n, s) => n + s.eventCount, 0);

  return (
    <div className={styles.product}>
      {/* The caret toggles the service list; the name goes to the product overview. */}
      <div className={styles.productRow} data-active={pathname === prefix}>
        <button
          className={styles.caretBtn}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={product.name}
        >
          <span className={styles.caret}>{open ? "▼" : "▶"}</span>
        </button>
        <Link href={prefix} className={styles.productLink}>
          <span className={styles.badge}>
            {product.name.charAt(0).toUpperCase()}
          </span>
          <span className={styles.name}>{product.name}</span>
        </Link>
        <span className={styles.count}>{count}</span>
      </div>
      {open && (
        <div className={styles.children}>
          {product.services.map((s) => {
            const href = `${prefix}/${s.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={s.id}
                href={href}
                className={`${styles.service} ${s.isMaster ? styles.master : ""}`}
                data-active={active}
              >
                <span className={`catDot`} data-cat="DEPLOY" />
                <span className={styles.name}>{s.name}</span>
                {s.isMaster && (
                  <span
                    className={styles.masterTag}
                    title={t("sidebar.masterApp")}
                  >
                    principal
                  </span>
                )}
                {s.openIncidentCount > 0 && (
                  <span
                    className={styles.openIncident}
                    title={t("nav.openIncidents")}
                  >
                    ▲ {s.openIncidentCount}
                  </span>
                )}
                {s.upcomingMaintenanceCount > 0 && (
                  <span
                    className={styles.upcoming}
                    title={t("nav.upcomingMaintenances")}
                  >
                    ▲ {s.upcomingMaintenanceCount}
                  </span>
                )}
                <span className={styles.count}>{s.eventCount}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
