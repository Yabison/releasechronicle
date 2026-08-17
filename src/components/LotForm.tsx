"use client";

import { useEffect, useState, useTransition } from "react";
import { createLotAction } from "@/app/actions/events";
import { defaultLotNumber } from "@/lib/lot";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { actionMessage, changeTypeLabel } from "@/i18n/labels";
import styles from "./EventForm.module.css";

const CHANGE_TYPES = ["NORMAL", "HOTFIX", "POSTMEP_SQL"];
const DEPLOY_STATUSES = [
  "SCHEDULED",
  "PENDING",
  "IN_PROGRESS",
  "DEPLOYED",
  "TESTING",
  "VALIDATE",
];

type Opt = { id: string; name: string; slug: string };

type Item = {
  id: string;
  company: string;
  product: string;
  service: string;
  version: string;
  externalLink: string;
};

let itemSeq = 0;
function emptyItem(): Item {
  return { id: `row-${itemSeq++}`, company: "", product: "", service: "", version: "", externalLink: "" };
}

export function LotForm({
  path,
  onSuccess,
}: {
  path: string;
  onSuccess: () => void;
}) {
  const { toInput, fromInput } = useTimeFormat();
  const nowInput = () => toInput(new Date());
  const [common, setCommon] = useState({
    environment: "",
    requester: "",
    changeType: "NORMAL",
    deployStatus: "SCHEDULED",
    lot: defaultLotNumber(),
    occurredAt: "",
    scheduledAt: nowInput(),
  });
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [envs, setEnvs] = useState<string[]>([]);
  const [products, setProducts] = useState<Record<string, Opt[]>>({});
  const [services, setServices] = useState<Record<string, Opt[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();

  useEffect(() => {
    fetch("/api/v1/companies")
      .then((r) => r.json())
      .then((rows: Opt[]) => setCompanies(rows));
    fetch("/api/v1/environments")
      .then((r) => r.json())
      .then((rows: { slug: string }[]) => setEnvs(rows.map((e) => e.slug)));
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { name?: string } | null }) => {
        if (d.user?.name) setCommon((c) => (c.requester ? c : { ...c, requester: d.user!.name! }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (envs.length && !common.environment) {
      setCommon((c) => ({ ...c, environment: envs[0] }));
    }
  }, [envs, common.environment]);

  function set<K extends keyof typeof common>(name: K, value: string) {
    setCommon((c) => ({ ...c, [name]: value }));
  }

  function setItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addRow() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeRow(index: number) {
    const id = items[index].id;
    setItems((prev) => prev.filter((_, i) => i !== index));
    setProducts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setServices((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  function onCompanyChange(index: number, company: string) {
    const id = items[index].id;
    setItem(index, { company, product: "", service: "" });
    setProducts((prev) => ({ ...prev, [id]: [] }));
    setServices((prev) => ({ ...prev, [id]: [] }));
    if (company) {
      fetch(`/api/v1/products?company=${encodeURIComponent(company)}`)
        .then((r) => r.json())
        .then((rows: Opt[]) => setProducts((prev) => ({ ...prev, [id]: rows })));
    }
  }

  function onProductChange(index: number, product: string) {
    const { id, company } = items[index];
    setItem(index, { product, service: "" });
    setServices((prev) => ({ ...prev, [id]: [] }));
    if (company && product) {
      fetch(
        `/api/v1/services?company=${encodeURIComponent(company)}&product=${encodeURIComponent(product)}`,
      )
        .then((r) => r.json())
        .then((rows: Opt[]) => setServices((prev) => ({ ...prev, [id]: rows })));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!common.environment) {
      setError(t("lot.errorEnv"));
      return;
    }
    const valid = items.filter(
      (it) => it.company && it.product && it.service && it.version.trim(),
    );
    if (valid.length === 0) {
      setError(t("lot.errorIncomplete"));
      return;
    }

    const payload = {
      path,
      common: {
        environment: common.environment,
        requester: common.requester,
        changeType: common.changeType,
        deployStatus: common.deployStatus,
        lot: common.lot,
        ...(common.occurredAt
          ? { occurredAt: fromInput(common.occurredAt) }
          : {}),
        ...(common.deployStatus === "SCHEDULED" && common.scheduledAt
          ? { scheduledAt: fromInput(common.scheduledAt) }
          : {}),
      },
      items: valid.map((it) => ({
        company: it.company,
        product: it.product,
        service: it.service,
        version: it.version,
        ...(it.externalLink ? { externalLink: it.externalLink } : {}),
      })),
    };

    startTransition(async () => {
      const res = await createLotAction(payload);
      if (res.ok) {
        onSuccess();
      } else {
        setError(actionMessage(t, res));
      }
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.row}>
        <label>
          {t("common.environment")}
          <select
            value={common.environment}
            onChange={(e) => set("environment", e.target.value)}
          >
            {envs.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("form.requester")}
          <input
            value={common.requester}
            onChange={(e) => set("requester", e.target.value)}
            placeholder="alice"
          />
        </label>
        <label>
          {t("form.changeType")}
          <select
            value={common.changeType}
            onChange={(e) => set("changeType", e.target.value)}
          >
            {CHANGE_TYPES.map((x) => (
              <option key={x} value={x}>
                {changeTypeLabel(t, x)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("common.status")}
          <select
            value={common.deployStatus}
            onChange={(e) => {
              const v = e.target.value;
              set("deployStatus", v);
              if (v === "SCHEDULED" && !common.scheduledAt) set("scheduledAt", nowInput());
            }}
          >
            {DEPLOY_STATUSES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("lot.number")}
          <input value={common.lot} onChange={(e) => set("lot", e.target.value)} />
        </label>
        {common.deployStatus === "SCHEDULED" && (
          <label>
            {t("form.scheduledAt")}
            <input
              type="datetime-local"
              value={common.scheduledAt}
              onChange={(e) => set("scheduledAt", e.target.value)}
            />
          </label>
        )}
        <label>
          {t("form.occurredAt")}
          <input
            type="datetime-local"
            value={common.occurredAt}
            onChange={(e) => set("occurredAt", e.target.value)}
          />
        </label>
      </div>

      {items.map((it, index) => (
        <div className={styles.row} key={it.id}>
          <label>
            {t("common.company")}
            <select
              value={it.company}
              onChange={(e) => onCompanyChange(index, e.target.value)}
            >
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("common.product")}
            <select
              value={it.product}
              disabled={!it.company}
              onChange={(e) => onProductChange(index, e.target.value)}
            >
              <option value="">—</option>
              {(products[it.id] ?? []).map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("common.service")}
            <select
              value={it.service}
              disabled={!it.product}
              onChange={(e) => setItem(index, { service: e.target.value })}
            >
              <option value="">—</option>
              {(services[it.id] ?? []).map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("common.version")}
            <input
              value={it.version}
              onChange={(e) => setItem(index, { version: e.target.value })}
              placeholder="1.5.0"
            />
          </label>
          <label>
            {t("form.link")}
            <input
              value={it.externalLink}
              onChange={(e) => setItem(index, { externalLink: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <button
            type="button"
            onClick={() => removeRow(index)}
            disabled={items.length <= 1}
            aria-label={t("lot.removeProduct")}
          >
            ×
          </button>
        </div>
      ))}

      <div className={styles.actions}>
        <button type="button" onClick={addRow}>
          {t("lot.addProduct")}
        </button>
      </div>

      <div className={styles.actions}>
        <button type="submit" disabled={pending}>
          {pending ? t("lot.creating") : t("lot.create")}
        </button>
        {error && (
          <span className={styles.error} role="status">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
