"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./metrics.module.css";
import { formatDuration } from "@/lib/duration";
import { useI18n } from "@/i18n/useI18n";
import type { DoraMetrics, DoraBand } from "@/lib/dora";

type Opt = { id: string; name: string; slug: string };
const WINDOWS = [30, 90, 180];

function Band({ b, t }: { b: DoraBand; t: (k: string) => string }) {
  return <span className={`${styles.band} ${styles[b]}`}>{t(`band.${b}`)}</span>;
}

export default function MetricsPage() {
  const { t } = useI18n();
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [services, setServices] = useState<Opt[]>([]);
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [service, setService] = useState("");
  const [environment, setEnvironment] = useState("");
  const [envs, setEnvs] = useState<string[]>([]);
  const [days, setDays] = useState(30);
  const [m, setM] = useState<DoraMetrics | null>(null);

  useEffect(() => { fetch("/api/v1/companies").then((r) => r.json()).then(setCompanies); }, []);
  useEffect(() => {
    fetch("/api/v1/environments")
      .then((r) => r.json())
      .then((rows: { slug: string }[]) => setEnvs(rows.map((e) => e.slug)));
  }, []);
  useEffect(() => {
    setProduct(""); setService(""); setProducts([]); setServices([]);
    if (company) fetch(`/api/v1/products?company=${company}`).then((r) => r.json()).then(setProducts);
  }, [company]);
  useEffect(() => {
    setService(""); setServices([]);
    if (company && product) fetch(`/api/v1/services?company=${company}&product=${product}`).then((r) => r.json()).then(setServices);
  }, [company, product]);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ days: String(days) });
    if (company) p.set("company", company);
    if (product) p.set("product", product);
    if (service) p.set("service", service);
    if (environment) p.set("environment", environment);
    const res = await fetch(`/api/v1/metrics/dora?${p}`);
    setM(await res.json());
  }, [company, product, service, environment, days]);
  useEffect(() => { void load(); }, [load]);

  return (
    <main className={styles.wrap}>
      <h1 className={styles.title}>{t("metrics.title")}</h1>
      <div className={styles.filters}>
        <select value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">{t("metrics.allCompanies")}</option>
          {companies.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={product} onChange={(e) => setProduct(e.target.value)} disabled={!company}>
          <option value="">{t("metrics.allProducts")}</option>
          {products.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
        </select>
        <select value={service} onChange={(e) => setService(e.target.value)} disabled={!product}>
          <option value="">{t("metrics.allServices")}</option>
          {services.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
          <option value="">{t("metrics.allEnvironments")}</option>
          {envs.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {WINDOWS.map((w) => <option key={w} value={w}>{t("metrics.windowDays", { days: w })}</option>)}
        </select>
      </div>

      {m && (
        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t("metrics.deployFrequency")}</div>
            <div className={styles.value}>{m.deploy.perDay.toFixed(2)}/j</div>
            <div className={styles.sub}>{t("metrics.deployFrequencySub", { count: m.deploy.count, days: m.windowDays })}</div>
            <Band b={m.deploy.band} t={t} />
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t("metrics.leadTime")}</div>
            <div className={styles.value}>{formatDuration(m.leadTime.medianMs)}</div>
            <div className={styles.sub}>{t("metrics.leadTimeSub", { sample: m.leadTime.sample })}</div>
            <Band b={m.leadTime.band} t={t} />
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t("metrics.changeFailure")}</div>
            <div className={styles.value}>{m.changeFailure.rate === null ? "—" : `${(m.changeFailure.rate * 100).toFixed(0)}%`}</div>
            <div className={styles.sub}>{t("metrics.changeFailureSub", { failures: m.changeFailure.failures, total: m.changeFailure.total })}</div>
            <Band b={m.changeFailure.band} t={t} />
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t("metrics.mttr")}</div>
            <div className={styles.value}>{formatDuration(m.mttr.medianMs)}</div>
            <div className={styles.sub}>{t("metrics.mttrSub", { sample: m.mttr.sample })}</div>
            <Band b={m.mttr.band} t={t} />
          </div>
        </div>
      )}
    </main>
  );
}
