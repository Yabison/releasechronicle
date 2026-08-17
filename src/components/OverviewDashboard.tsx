"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Overview, OverviewEventRow } from "@/lib/overview";
import { STATUS_META } from "@/lib/deployStatusMeta";
import type { DeployStatus } from "@prisma/client";
import { useI18n } from "@/i18n/useI18n";
import { categoryLabel } from "@/i18n/labels";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import styles from "./Overview.module.css";

/**
 * The dashboard behind /, /[company] and /[company]/[product]: counter boxes,
 * then ONE event feed under filters (environment, category, free text) — the
 * same reading model as the service page, one level up. The incident and
 * maintenance boxes double as filters; every filter mirrors to the URL so a
 * view can be shared.
 */
const CATS = ["DEPLOY", "HOTFIX", "INCIDENT", "MAINTENANCE"] as const;
type Cat = (typeof CATS)[number];
const ALL_ENV = "ALL";

function catOf(r: OverviewEventRow): Cat {
  if (r.type === "INCIDENT") return "INCIDENT";
  if (r.type === "MAINTENANCE") return "MAINTENANCE";
  return r.changeType === "HOTFIX" ? "HOTFIX" : "DEPLOY";
}

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
  const searchParams = useSearchParams();
  const scoped = Boolean(companyName);
  const c = overview.counters;

  const [env, setEnv] = useState<string>(() => searchParams.get("env") ?? ALL_ENV);
  const [cats, setCats] = useState<Set<Cat>>(() => {
    const p = searchParams.get("cat");
    const keys = p ? p.split(",").filter((k): k is Cat => (CATS as readonly string[]).includes(k)) : [];
    return keys.length ? new Set(keys) : new Set(CATS);
  });
  const [text, setText] = useState(() => searchParams.get("q") ?? "");

  // Shareable filters, same mechanism as the service page: replaceState, no
  // server round-trip, defaults omitted.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const put = (k: string, v: string | null) => (v === null ? p.delete(k) : p.set(k, v));
    put("env", env === ALL_ENV ? null : env);
    put("cat", cats.size === CATS.length ? null : [...cats].join(","));
    put("q", text || null);
    const qs = p.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : "");
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [env, cats, text]);

  const envs = useMemo(() => [...new Set(overview.events.map((e) => e.environment))].sort(), [overview.events]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return overview.events.filter((r) => {
      if (env !== ALL_ENV && r.environment !== env) return false;
      if (!cats.has(catOf(r))) return false;
      if (q) {
        const hay = `${r.service.name} ${r.product.name} ${r.version ?? ""} ${r.requester ?? ""} ${r.comment ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [overview.events, env, cats, text]);

  /** A counter box that narrows the feed to its category when clicked. */
  const only = (want: Cat[] | null) =>
    setCats((s) => {
      if (!want) return new Set(CATS);
      const same = s.size === want.length && want.every((k) => s.has(k));
      return same ? new Set(CATS) : new Set(want);
    });

  return (
    <div className={styles.wrap}>
      <div>
        {scoped && <div className={styles.crumb}>{companyName}{productName ? ` / ${productName}` : ""}</div>}
        <h1 className={styles.title}>{t("home.title")}</h1>
      </div>

      <div className={styles.counters}>
        <Counter value={c.services} label={t("home.services")} onClick={() => only(null)} />
        <Counter value={c.deploys30d} label={t("home.deploys30d")} onClick={() => only(["DEPLOY", "HOTFIX"])} pressed={cats.size === 2 && cats.has("DEPLOY") && cats.has("HOTFIX")} />
        <Counter value={c.openIncidents} label={t("home.openIncidents")} alert={c.openIncidents > 0} onClick={() => only(["INCIDENT"])} pressed={cats.size === 1 && cats.has("INCIDENT")} />
        <Counter value={c.upcomingMaintenances} label={t("home.upcoming")} onClick={() => only(["MAINTENANCE"])} pressed={cats.size === 1 && cats.has("MAINTENANCE")} />
      </div>

      <div className={styles.filters}>
        <select value={env} onChange={(e) => setEnv(e.target.value)} aria-label={t("common.environment")}>
          <option value={ALL_ENV}>{t("detail.allEnvs")}</option>
          {envs.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {CATS.map((k) => (
          <button
            key={k}
            type="button"
            data-active={cats.has(k)}
            onClick={() => setCats((s) => {
              const n = new Set(s);
              if (n.has(k)) n.delete(k); else n.add(k);
              return n.size ? n : new Set(CATS);
            })}
          >
            {categoryLabel(t, k)}
          </button>
        ))}
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("home.searchPh")}
          aria-label={t("home.searchPh")}
        />
      </div>

      <div className={styles.rows}>
        {filtered.length === 0 && <p className={styles.empty}>{t("home.none")}</p>}
        {filtered.map((r) => <Row key={r.id} r={r} showCtx={!productName} />)}
      </div>
    </div>
  );
}

function Counter({
  value, label, alert = false, pressed = false, onClick,
}: {
  value: number;
  label: string;
  alert?: boolean;
  pressed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={styles.counter} data-alert={alert} aria-pressed={pressed} onClick={onClick}>
      <div className={styles.counterValue}>{value}</div>
      <div className={styles.counterLabel}>{label}</div>
    </button>
  );
}

function Row({ r, showCtx }: { r: OverviewEventRow; showCtx: boolean }) {
  const { stampShort } = useTimeFormat();
  const { t } = useI18n();
  const cat = catOf(r);
  const href = `/${r.company.slug}/${r.product.slug}/${r.service.slug}?event=${r.id}`;
  const status = r.deployStatus as DeployStatus | null;
  const when =
    cat === "MAINTENANCE" ? (r.windowStart ?? r.occurredAt)
    : cat === "INCIDENT" ? (r.startedAt ?? r.occurredAt)
    : (r.scheduledAt ?? r.occurredAt);
  return (
    <Link className={styles.row} href={href}>
      <span className="catDot" data-cat={cat} />
      <span className={styles.rowMain}>
        {showCtx && <span className={styles.rowCtx}>{r.product.name} / </span>}
        {r.service.name}
        {r.version ? ` v${r.version}` : ""}
        {cat === "INCIDENT" && r.comment ? ` — ${r.comment}` : ""}
      </span>
      <span className={styles.envBadge}>{r.environment}</span>
      {cat !== "INCIDENT" && cat !== "MAINTENANCE" && status && (
        <span className="deployPill" style={{ background: STATUS_META[status]?.color }}>{status}</span>
      )}
      {cat === "INCIDENT" && !r.resolvedAt && <span className={styles.openTag}>{t("home.openTag")}</span>}
      <span className={styles.meta}>{stampShort(when)}</span>
    </Link>
  );
}
