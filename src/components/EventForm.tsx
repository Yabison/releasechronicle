"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction, type CreateEventInput } from "@/app/actions/events";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { actionMessage, changeTypeLabel } from "@/i18n/labels";
import styles from "./EventForm.module.css";

const EVENT_TYPES = ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"] as const;
const CHANGE_TYPES = ["NORMAL", "HOTFIX", "PRE_MEP", "POST_MEP"];
const DEPLOY_STATUSES = [
  "SCHEDULED",
  "PENDING",
  "IN_PROGRESS",
  "DEPLOYED",
  "TESTING",
  "VALIDATE",
];
const INCIDENT_STATUSES = [
  "INVESTIGATING",
  "IDENTIFIED",
  "MONITORING",
  "RESOLVED",
];

type EventType = (typeof EVENT_TYPES)[number];

// A deployment defaults to SCHEDULED with the planned date prefilled to now
// (expressed in the user's display timezone by the caller).
const deployDefaults = (now: string): Record<string, string> => ({ deployStatus: "SCHEDULED", scheduledAt: now });

export type MepCandidate = { id: string; label: string };

export function EventForm({
  company,
  product,
  service,
  path,
  onSuccess,
  mepCandidates = [],
  defaultChangeType,
  defaultParentId,
  defaultEnvironment,
  parentOccurredAt,
}: {
  company: string;
  product: string;
  service: string;
  path: string;
  onSuccess?: () => void;
  mepCandidates?: MepCandidate[];
  defaultChangeType?: string;
  defaultParentId?: string;
  defaultEnvironment?: string;
  parentOccurredAt?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { toInput, fromInput } = useTimeFormat();
  const [type, setType] = useState<EventType>("DEPLOYMENT");
  const isPhase = defaultChangeType === "PRE_MEP" || defaultChangeType === "POST_MEP";
  const [environment, setEnvironment] = useState(defaultEnvironment || "PROD");
  const [envs, setEnvs] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>(() => ({
    ...deployDefaults(toInput(new Date())),
    ...(defaultChangeType ? { changeType: defaultChangeType } : {}),
    ...(defaultParentId ? { parentId: defaultParentId } : {}),
    ...(isPhase && parentOccurredAt
      ? { occurredAt: toInput(new Date(new Date(parentOccurredAt).getTime() + (defaultChangeType === "PRE_MEP" ? -3600_000 : 3600_000))) }
      : {}),
  }));
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagSug, setTagSug] = useState<string[]>([]);
  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    // The environment select is unusable without this list: surface the failure.
    fetch("/api/v1/environments")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: { slug: string }[]) => setEnvs(rows.map((e) => e.slug)))
      .catch(() => setMessage({ ok: false, text: t("common.loadFailed") }));
    // Cosmetic on purpose: no tag suggestions is a degraded experience, not a broken form.
    fetch("/api/v1/tags")
      .then((r) => r.json())
      .then((rows: { name: string }[]) => setTagSug(rows.map((t) => t.name)))
      .catch(() => {});
    // Default the requester to the logged-in user; the field stays editable either way.
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { name?: string } | null }) => {
        if (d.user?.name) setFields((f) => (f.requester ? f : { ...f, requester: d.user!.name! }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!defaultEnvironment && envs.length && !envs.includes(environment)) setEnvironment(envs[0]);
  }, [envs, environment, defaultEnvironment]);

  function set(name: string, value: string) {
    setFields((f) => ({ ...f, [name]: value }));
  }

  function reset() {
    setFields({
      ...deployDefaults(toInput(new Date())),
      ...(defaultChangeType ? { changeType: defaultChangeType } : {}),
      ...(defaultParentId ? { parentId: defaultParentId } : {}),
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const pendingTag = tagInput.trim();
    const allTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;
    const base: CreateEventInput = {
      type,
      company,
      product,
      service,
      path,
      environment,
      ...(allTags.length ? { tags: allTags } : {}),
    };

    // Only include non-empty optional fields; validators treat "" as absent.
    const f = (k: string) => (fields[k]?.trim() ? fields[k] : undefined);
    // datetime-local values are naive: convert them to ISO instants HERE, where the
    // display timezone is known. Sending the naive string lets the server reinterpret
    // it in its own timezone (10:00 Paris used to be stored as 10:00 UTC).
    const dt = (k: string) => {
      const v = f(k);
      return v ? fromInput(v) : undefined;
    };
    let body: CreateEventInput = base;
    if (type === "DEPLOYMENT") {
      body = {
        ...base,
        version: f("version"),
        requester: f("requester"),
        changeType: f("changeType") ?? "NORMAL",
        deployStatus: f("deployStatus") ?? "SCHEDULED",
        externalLink: f("externalLink"),
        occurredAt: dt("occurredAt"),
        ...(f("hourType") ? { hourType: f("hourType") } : {}),
        ...(f("comment") ? { comment: f("comment") } : {}),
        ...(f("parentId") ? { parentId: f("parentId") } : {}),
        ...(f("deployStatus") === "SCHEDULED" && f("scheduledAt")
          ? { scheduledAt: dt("scheduledAt") }
          : {}),
      };
    } else if (type === "INCIDENT") {
      body = {
        ...base,
        incidentType: f("incidentType"),
        incidentStatus: f("incidentStatus") ?? "INVESTIGATING",
        startedAt: dt("startedAt"),
        resolvedAt: dt("resolvedAt"),
        comment: f("comment"),
      };
    } else {
      body = {
        ...base,
        windowStart: dt("windowStart"),
        windowEnd: dt("windowEnd"),
        version: f("version"),
      };
    }

    startTransition(async () => {
      const res = await createEventAction(body);
      if (res.ok) {
        setMessage({ ok: true, text: t("form.created", { type }) });
        setTags([]);
        setTagInput("");
        reset();
        router.refresh();
        onSuccess?.();
      } else {
        setMessage({ ok: false, text: actionMessage(t, res) });
      }
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.row}>
        <label>
          {t("form.type")}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("common.environment")}
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            disabled={!!defaultEnvironment}
            title={defaultEnvironment ? t("form.inheritedFromParent") : undefined}
          >
            {envs.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.wide}>
          {t("form.tags")}
          <span className={styles.tagRow}>
            {tags.map((t) => (
              <span key={t} className={styles.tagChip}>
                {t}<button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`retirer ${t}`}>×</button>
              </span>
            ))}
            <input
              list="new-tag-suggestions"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder={t("form.addTag")}
            />
            <datalist id="new-tag-suggestions">{tagSug.map((s) => <option key={s} value={s} />)}</datalist>
            <button type="button" onClick={addTag}>+</button>
          </span>
        </label>
      </div>

      {type === "DEPLOYMENT" && (
        <div className={styles.row}>
          <label>
            {t("common.version")}
            <input
              value={fields.version ?? ""}
              onChange={(e) => set("version", e.target.value)}
              placeholder="1.5.0"
            />
          </label>
          <label>
            {t("form.requester")}
            <input
              value={fields.requester ?? ""}
              onChange={(e) => set("requester", e.target.value)}
              placeholder="alice"
            />
          </label>
          <label>
            {t("form.changeType")}
            <select
              value={fields.changeType ?? "NORMAL"}
              onChange={(e) => set("changeType", e.target.value)}
            >
              {CHANGE_TYPES.map((x) => (
                <option key={x} value={x}>
                  {changeTypeLabel(t, x)}
                </option>
              ))}
            </select>
          </label>
          {(fields.changeType === "PRE_MEP" || fields.changeType === "POST_MEP") && (
            <label>
              {t("form.mepParent")}
              <select value={fields.parentId ?? ""} onChange={(e) => set("parentId", e.target.value)}>
                <option value="">{t("form.chooseParent")}</option>
                {mepCandidates.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t("common.status")}
            <select
              value={fields.deployStatus ?? "SCHEDULED"}
              onChange={(e) => {
                const v = e.target.value;
                set("deployStatus", v);
                if (v === "SCHEDULED" && !fields.scheduledAt) set("scheduledAt", toInput(new Date()));
              }}
            >
              {DEPLOY_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          {fields.deployStatus === "SCHEDULED" && (
            <label>
              {t("form.scheduledAt")}
              <input
                type="datetime-local"
                value={fields.scheduledAt ?? ""}
                onChange={(e) => set("scheduledAt", e.target.value)}
              />
            </label>
          )}
          <label>
            HO / HNO
            <select value={fields.hourType ?? ""} onChange={(e) => set("hourType", e.target.value)}>
              <option value="">—</option>
              <option value="HO">{t("form.hoLong")}</option>
              <option value="HNO">{t("form.hnoLong")}</option>
            </select>
          </label>
          <label>
            {t("form.link")}
            <input
              value={fields.externalLink ?? ""}
              onChange={(e) => set("externalLink", e.target.value)}
              placeholder="https://…"
            />
          </label>
          <label>
            {t("form.occurredAt")}
            <input
              type="datetime-local"
              value={fields.occurredAt ?? ""}
              onChange={(e) => set("occurredAt", e.target.value)}
              min={isPhase && defaultChangeType === "POST_MEP" && parentOccurredAt ? toInput(parentOccurredAt) : undefined}
              max={isPhase && defaultChangeType === "PRE_MEP" && parentOccurredAt ? toInput(parentOccurredAt) : undefined}
            />
          </label>
          <label className={styles.wide}>
            {isPhase ? t("form.commentPhase") : t("form.commentOpt")}
            <input value={fields.comment ?? ""} onChange={(e) => set("comment", e.target.value)} placeholder="…" />
          </label>
        </div>
      )}

      {type === "INCIDENT" && (
        <div className={styles.row}>
          <label>
            {t("form.incidentType")}
            <input
              value={fields.incidentType ?? ""}
              onChange={(e) => set("incidentType", e.target.value)}
              placeholder="latency"
            />
          </label>
          <label>
            {t("common.status")}
            <select
              value={fields.incidentStatus ?? "INVESTIGATING"}
              onChange={(e) => set("incidentStatus", e.target.value)}
            >
              {INCIDENT_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("form.startedAt")}
            <input
              type="datetime-local"
              value={fields.startedAt ?? ""}
              onChange={(e) => set("startedAt", e.target.value)}
            />
          </label>
          <label>
            {t("form.resolvedAt")}
            <input
              type="datetime-local"
              value={fields.resolvedAt ?? ""}
              onChange={(e) => set("resolvedAt", e.target.value)}
            />
          </label>
          <label className={styles.wide}>
            {t("form.commentOpt")}
            <input
              value={fields.comment ?? ""}
              onChange={(e) => set("comment", e.target.value)}
              placeholder="Elevated p99…"
            />
          </label>
        </div>
      )}

      {type === "MAINTENANCE" && (
        <div className={styles.row}>
          <label>
            {t("form.windowStart")}
            <input
              type="datetime-local"
              value={fields.windowStart ?? ""}
              onChange={(e) => set("windowStart", e.target.value)}
            />
          </label>
          <label>
            {t("form.windowEnd")}
            <input
              type="datetime-local"
              value={fields.windowEnd ?? ""}
              onChange={(e) => set("windowEnd", e.target.value)}
            />
          </label>
          <label>
            {t("form.versionOpt")}
            <input
              value={fields.version ?? ""}
              onChange={(e) => set("version", e.target.value)}
              placeholder="1.5.0"
            />
          </label>
        </div>
      )}

      <div className={styles.actions}>
        <button type="submit" disabled={pending}>
          {pending ? t("form.creating") : t("form.create", { type: type.toLowerCase() })}
        </button>
        {message && (
          <span className={message.ok ? styles.ok : styles.error} role="status">
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
