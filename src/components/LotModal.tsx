"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LotForm } from "./LotForm";
import { createLotFromExistingAction } from "@/app/actions/events";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { actionMessage } from "@/i18n/labels";
import styles from "./EventModal.module.css";

type Candidate = { eventId: string; product: string; service: string; version: string | null; occurredAt: string; lot: string | null };

export function LotModal({
  path,
  company,
  onClose,
}: {
  path: string;
  company: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const { t } = useI18n();
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label={t("common.close")}>×</button>
        <h2>{t("lot.modalTitle")}</h2>
        <div className={styles.lotTabs}>
          <button type="button" data-active={mode === "new"} onClick={() => setMode("new")}>{t("lot.tabNew")}</button>
          <button type="button" data-active={mode === "existing"} onClick={() => setMode("existing")}>{t("lot.tabExisting")}</button>
        </div>
        {mode === "new" ? (
          <LotForm path={path} onSuccess={onClose} />
        ) : (
          <ExistingLot path={path} company={company} onSuccess={onClose} />
        )}
      </div>
    </div>
  );
}

function ExistingLot({ path, company, onSuccess }: { path: string; company: string; onSuccess: () => void }) {
  const router = useRouter();
  const [envs, setEnvs] = useState<string[]>([]);
  const [env, setEnv] = useState("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lot, setLot] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  const { stampFull } = useTimeFormat();

  useEffect(() => {
    fetch("/api/v1/environments")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: { slug: string }[]) => setEnvs(rows.map((e) => e.slug)))
      .catch(() => setErr(t("common.loadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setCands([]); setSel(new Set());
    if (env) {
      fetch(`/api/v1/lots/candidates?company=${company}&environment=${env}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(setCands)
        .catch(() => setErr(t("common.loadFailed")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, company]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function submit() {
    setErr(null); setBusy(true);
    const res = await createLotFromExistingAction({ eventIds: [...sel], lot, path });
    setBusy(false);
    if (res.ok) { router.refresh(); onSuccess(); } else setErr(actionMessage(t, res));
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        {t("common.environment")}
        <select value={env} onChange={(e) => setEnv(e.target.value)}>
          <option value="">{t("lot.choose")}</option>
          {envs.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        {t("lot.key")}
        <input value={lot} onChange={(e) => setLot(e.target.value)} placeholder={t("lot.keyPlaceholder")} />
      </label>
      <div className={styles.candList}>
        {env && cands.length === 0 && <p className={styles.muted}>{t("lot.noEligible")}</p>}
        {cands.map((c) => (
          <label key={c.eventId} className={styles.candRow}>
            <input type="checkbox" checked={sel.has(c.eventId)} onChange={() => toggle(c.eventId)} />
            <span className={styles.candMain}>{c.product} / {c.service}{c.version ? ` · v${c.version}` : ""}</span>
            <span className={styles.candMeta}>{stampFull(c.occurredAt)}{c.lot ? ` · lot ${c.lot}` : ""}</span>
          </label>
        ))}
      </div>
      <button className={styles.submit} disabled={busy || !lot.trim() || sel.size === 0} onClick={submit}>
        {busy ? t("common.loading") : t("lot.createN", { n: sel.size })}
      </button>
      {err && <p className={styles.error}>{err}</p>}
    </div>
  );
}
