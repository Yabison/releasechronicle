"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Overview } from "@/lib/overview";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import { buildServiceTimeline, groupByMonth } from "@/lib/eventTimeline";
import { FILTER_KEYS, DEPLOY_KEYS, entryFilterKey, isFilterKey, type FilterKey } from "@/lib/timelineFilter";
import type { LotMember } from "@/lib/deployLot";
import { CategoryFilter } from "./CategoryFilter";
import { TimelineRow } from "./TimelineRow";
import detail from "./DetailPane.module.css";
import styles from "./Overview.module.css";

/**
 * The dashboard behind /, /[company] and /[company]/[product]: counter boxes,
 * then ONE event feed under filters (environment, category, free text) — the
 * same reading model as the service page, one level up. The incident and
 * maintenance boxes double as filters; every filter mirrors to the URL so a
 * view can be shared.
 */
const ALL_ENV = "ALL";
const lotKey = (env: string, lot: string) => `${env}::${lot}`;

export function OverviewDashboard({
  overview,
  companyName,
  productName,
  envColors = {},
  tagColors = {},
  lotMembers = {},
  lotWarnings = {},
}: {
  overview: Overview;
  companyName?: string;
  productName?: string;
  envColors?: Record<string, string>;
  tagColors?: Record<string, string>;
  lotMembers?: Record<string, LotMember[]>;
  lotWarnings?: Record<string, string[]>;
}) {
  const { t, locale } = useI18n();
  const { mode: timeMode } = useTimeFormat();
  useAutoRefresh();
  const searchParams = useSearchParams();
  const scoped = Boolean(companyName);
  const c = overview.counters;

  const [env, setEnv] = useState<string>(() => searchParams.get("env") ?? ALL_ENV);
  const [cats, setCats] = useState<Set<FilterKey>>(() => {
    const p = searchParams.get("cat");
    const keys = p ? p.split(",").filter(isFilterKey) : [];
    return keys.length ? new Set(keys) : new Set<FilterKey>(FILTER_KEYS);
  });
  const [text, setText] = useState(() => searchParams.get("q") ?? "");

  // Shareable filters, same mechanism as the service page: replaceState, no
  // server round-trip, defaults omitted.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const put = (k: string, v: string | null) => (v === null ? p.delete(k) : p.set(k, v));
    put("env", env === ALL_ENV ? null : env);
    put("cat", cats.size === FILTER_KEYS.length ? null : [...cats].join(","));
    put("q", text || null);
    const qs = p.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : "");
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [env, cats, text]);

  /** serviceId -> where it lives, for the row label and the free-text search. */
  const context = useMemo(() => {
    const map: Record<string, { company: { slug: string; name: string }; product: { slug: string; name: string }; service: { slug: string; name: string } }> = {};
    for (const e of overview.events) map[e.serviceId] = { company: e.company, product: e.product, service: e.service };
    return map;
  }, [overview.events]);
  const byEventId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of overview.events) map[e.id] = e.serviceId;
    return map;
  }, [overview.events]);
  const ctxOf = (eventId: string) => context[byEventId[eventId] ?? ""];
  const hrefFor = (eventId: string) => {
    const c = ctxOf(eventId);
    return c ? `/${c.company.slug}/${c.product.slug}/${c.service.slug}?event=${eventId}` : "#";
  };
  /** Product is implied on a product page, so only the service is named there. */
  const contextLabel = (eventId: string) => {
    const c = ctxOf(eventId);
    if (!c) return null;
    return productName ? c.service.name : `${c.product.name} / ${c.service.name}`;
  };

  const envs = useMemo(() => [...new Set(overview.events.map((e) => e.environment))].sort(), [overview.events]);

  /**
   * Events are narrowed first, then turned into timeline entries — the same
   * pipeline the service page runs, so a row here shows the rollbacks, lots,
   * phases and durations that the old dashboard row silently dropped.
   */
  const months = useMemo(() => {
    const q = text.trim().toLowerCase();
    const events = overview.events.filter((r) => {
      if (env !== ALL_ENV && r.environment !== env) return false;
      if (q) {
        const ctx = context[r.serviceId];
        const hay = `${ctx?.service.name ?? ""} ${ctx?.product.name ?? ""} ${r.version ?? ""} ${r.requester ?? ""} ${r.comment ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const { history, maintenances } = buildServiceTimeline(events);
    const entries = [...maintenances, ...history].filter((e) => cats.has(entryFilterKey(e)));
    return groupByMonth(entries, { mode: timeMode, locale });
  }, [overview.events, context, env, cats, text, timeMode, locale]);

  const total = useMemo(() => months.reduce((n, g) => n + g.entries.length, 0), [months]);

  /** A counter box that narrows the feed to its category when clicked. */
  const only = (want: FilterKey[] | null) =>
    setCats((s) => {
      if (!want) return new Set<FilterKey>(FILTER_KEYS);
      const same = s.size === want.length && want.every((k) => s.has(k));
      return same ? new Set<FilterKey>(FILTER_KEYS) : new Set(want);
    });

  return (
    <div className={styles.wrap}>
      <div>
        {scoped && <div className={styles.crumb}>{companyName}{productName ? ` / ${productName}` : ""}</div>}
        <h1 className={styles.title}>{t("home.title")}</h1>
      </div>

      <div className={styles.counters}>
        <Counter value={c.services} label={t("home.services")} onClick={() => only(null)} />
        <Counter value={c.deploys30d} label={t("home.deploys30d")} onClick={() => only(DEPLOY_KEYS)} pressed={cats.size === DEPLOY_KEYS.length && DEPLOY_KEYS.every((k) => cats.has(k))} />
        <Counter value={c.openIncidents} label={t("home.openIncidents")} alert={c.openIncidents > 0} onClick={() => only(["INCIDENT"])} pressed={cats.size === 1 && cats.has("INCIDENT")} />
        <Counter value={c.upcomingMaintenances} label={t("home.upcoming")} onClick={() => only(["MAINTENANCE"])} pressed={cats.size === 1 && cats.has("MAINTENANCE")} />
      </div>

      <CategoryFilter active={cats} onToggle={(k) => setCats((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k); else next.add(k);
        return next.size ? next : new Set<FilterKey>(FILTER_KEYS);
      })} />

      <div className={styles.filters}>
        <select value={env} onChange={(e) => setEnv(e.target.value)} aria-label={t("common.environment")}>
          <option value={ALL_ENV}>{t("detail.allEnvs")}</option>
          {envs.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("home.searchPh")}
          aria-label={t("home.searchPh")}
        />
      </div>

      {total === 0 ? (
        <p className={styles.empty}>{t("home.none")}</p>
      ) : (
        months.map((g) => (
          <div key={g.key} className={detail.month}>
            <div className={detail.monthLabel}>{g.label}</div>
            {g.entries.map((e) => (
              <TimelineRow
                key={e.id}
                entry={e}
                onClick={() => { window.location.href = hrefFor(e.eventId); }}
                envColor={envColors[e.environment] ?? null}
                tagColors={tagColors}
                lotMembers={e.lot ? (lotMembers[lotKey(e.environment, e.lot)] ?? []) : []}
                lotWarning={e.lot ? (lotWarnings[lotKey(e.environment, e.lot)] ?? []) : []}
                context={contextLabel(e.eventId)}
              />
            ))}
          </div>
        ))
      )}
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

