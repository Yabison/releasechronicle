"use client";

import Link from "next/link";
import type { Overview, OverviewEventRow } from "@/lib/overview";
import { STATUS_META } from "@/lib/deployStatusMeta";
import type { DeployStatus } from "@prisma/client";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import styles from "./Overview.module.css";

/**
 * The dashboard behind /, /[company] and /[company]/[product] — the pages that
 * used to say "select a component". Counters up top, then what a release manager
 * checks first: what is moving right now, what is broken, what is planned, and
 * what shipped last.
 */
export function OverviewDashboard({
  overview,
  companyName,
  productName,
}: {
  overview: Overview;
  companyName?: string;
  productName?: string;
}) {
  const { t } = useI18n();
  useAutoRefresh();
  const scoped = Boolean(companyName);
  const c = overview.counters;

  return (
    <div className={styles.wrap}>
      <div>
        {scoped && <div className={styles.crumb}>{companyName}{productName ? ` / ${productName}` : ""}</div>}
        <h1 className={styles.title}>{t("home.title")}</h1>
      </div>

      <div className={styles.counters}>
        <Counter value={c.services} label={t("home.services")} />
        <Counter value={c.deploys30d} label={t("home.deploys30d")} />
        <Counter value={c.openIncidents} label={t("home.openIncidents")} />
        <Counter value={c.upcomingMaintenances} label={t("home.upcoming")} />
      </div>

      <div className={styles.sections}>
        <Section title={t("home.inFlight")} rows={overview.inFlight} kind="deploy" showCtx={!productName} empty={t("home.none")} />
        <Section title={t("home.openIncidents")} rows={overview.openIncidents} kind="incident" showCtx={!productName} empty={t("home.none")} />
        <Section title={t("home.upcoming")} rows={overview.upcomingMaintenances} kind="maintenance" showCtx={!productName} empty={t("home.none")} />
        <Section title={t("home.recent")} rows={overview.recentDeployments} kind="deploy" showCtx={!productName} empty={t("home.none")} />
      </div>
    </div>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.counter}>
      <div className={styles.counterValue}>{value}</div>
      <div className={styles.counterLabel}>{label}</div>
    </div>
  );
}

function Section({
  title, rows, kind, showCtx, empty,
}: {
  title: string;
  rows: OverviewEventRow[];
  kind: "deploy" | "incident" | "maintenance";
  showCtx: boolean;
  empty: string;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.secTitle}>{title}</h2>
      {rows.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <div className={styles.rows}>
          {rows.map((r) => <Row key={r.id} r={r} kind={kind} showCtx={showCtx} />)}
        </div>
      )}
    </section>
  );
}

function Row({ r, kind, showCtx }: { r: OverviewEventRow; kind: "deploy" | "incident" | "maintenance"; showCtx: boolean }) {
  const { stampShort } = useTimeFormat();
  const cat = r.type === "INCIDENT" ? "INCIDENT" : r.type === "MAINTENANCE" ? "MAINTENANCE" : r.changeType === "HOTFIX" ? "HOTFIX" : "DEPLOY";
  const href = `/${r.company.slug}/${r.product.slug}/${r.service.slug}?event=${r.id}`;
  const status = r.deployStatus as DeployStatus | null;
  const when = kind === "maintenance" ? (r.windowStart ?? r.occurredAt) : kind === "incident" ? (r.startedAt ?? r.occurredAt) : (r.scheduledAt ?? r.occurredAt);
  return (
    <Link className={styles.row} href={href}>
      <span className="catDot" data-cat={cat} />
      <span className={styles.rowMain}>
        {showCtx && <span className={styles.rowCtx}>{r.product.name} / </span>}
        {r.service.name}
        {r.version ? ` v${r.version}` : ""}
        {kind === "incident" && r.comment ? ` — ${r.comment}` : ""}
      </span>
      <span className={styles.envBadge}>{r.environment}</span>
      {kind === "deploy" && status && (
        <span className="deployPill" style={{ background: STATUS_META[status]?.color }}>{status}</span>
      )}
      <span className={styles.meta}>{stampShort(when)}</span>
    </Link>
  );
}
