"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/useI18n";
import styles from "./PublicConfig.module.css";

type Svc = { slug: string; name: string; public: boolean };
type Prod = { slug: string; name: string; public: boolean; services: Svc[] };
type Company = { slug: string; name: string; public: boolean; products: Prod[] };
type Env = { id: string; slug: string; name: string; public: boolean };

const EVENT_TYPES = ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"] as const;

export function PublicConfig({ tree, envs, eventTypes }: { tree: Company[]; envs: Env[]; eventTypes: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [types, setTypes] = useState<string[]>(eventTypes);

  function patch(url: string, body: unknown) {
    startTransition(async () => {
      await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      router.refresh();
    });
  }
  const setCompany = (c: Company, v: boolean) => patch(`/api/v1/companies/${c.slug}`, { public: v });
  const setProduct = (c: Company, p: Prod, v: boolean) => patch(`/api/v1/products/${p.slug}?company=${c.slug}`, { public: v });
  const setService = (c: Company, p: Prod, s: Svc, v: boolean) =>
    patch(`/api/v1/services/${s.slug}?company=${c.slug}&product=${p.slug}`, { public: v });
  const setEnv = (e: Env, v: boolean) => patch(`/api/v1/environments/${e.id}`, { public: v });

  function toggleType(ty: string) {
    const next = types.includes(ty) ? types.filter((x) => x !== ty) : [...types, ty];
    setTypes(next);
    startTransition(async () => {
      await fetch("/api/v1/public-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventTypes: next }) });
      router.refresh();
    });
  }

  const typeLabel = (ty: string) =>
    ty === "DEPLOYMENT" ? t("publicCfg.typeDeployment") : ty === "INCIDENT" ? t("publicCfg.typeIncident") : t("publicCfg.typeMaintenance");

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Link href="/admin" className={styles.back}>{t("publicCfg.back")}</Link>
        <h1 className={styles.title}>{t("publicCfg.title")}</h1>
      </div>
      <p className={styles.intro}>{t("publicCfg.intro")}</p>

      <section className={styles.section}>
        <h2 className={styles.h2}>{t("publicCfg.eventTypes")}</h2>
        <div className={styles.chips}>
          {EVENT_TYPES.map((ty) => (
            <label key={ty} className={styles.chip} data-on={types.includes(ty)}>
              <input type="checkbox" checked={types.includes(ty)} disabled={pending} onChange={() => toggleType(ty)} />
              {typeLabel(ty)}
            </label>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>{t("publicCfg.environments")}</h2>
        <div className={styles.chips}>
          {envs.map((e) => (
            <label key={e.id} className={styles.chip} data-on={e.public}>
              <input type="checkbox" checked={e.public} disabled={pending} onChange={(ev) => setEnv(e, ev.target.checked)} />
              {e.name}
            </label>
          ))}
          {envs.length === 0 && <span className={styles.muted}>—</span>}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>{t("publicCfg.entities")}</h2>
        <p className={styles.hint}>{t("publicCfg.hint")}</p>
        <div className={styles.tree}>
          {tree.map((c) => (
            <div key={c.slug} className={styles.company}>
              <label className={styles.row} data-level="company">
                <input type="checkbox" checked={c.public} disabled={pending} onChange={(e) => setCompany(c, e.target.checked)} />
                <strong>{c.name}</strong>
              </label>
              {c.products.map((p) => (
                <div key={p.slug} className={styles.product}>
                  <label className={styles.row} data-level="product" data-dim={!c.public}>
                    <input type="checkbox" checked={p.public} disabled={pending} onChange={(e) => setProduct(c, p, e.target.checked)} />
                    {p.name}
                  </label>
                  {p.services.map((s) => (
                    <label key={s.slug} className={styles.row} data-level="service" data-dim={!c.public || !p.public}>
                      <input type="checkbox" checked={s.public} disabled={pending} onChange={(e) => setService(c, p, s, e.target.checked)} />
                      {s.name}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {tree.length === 0 && <span className={styles.muted}>—</span>}
        </div>
      </section>
    </div>
  );
}
