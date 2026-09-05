"use client";
import Link from "next/link";
import { ChangelogBody } from "./ChangelogBody";

import { useRef, useState, useTransition, useMemo, useEffect } from "react";
import { slugify } from "@/lib/slug";
import { traceRelease } from "@/lib/releaseTrace";
import { useRouter } from "next/navigation";
import { useModalDismiss } from "@/lib/useModalDismiss";
import type { ClientEvent } from "@/lib/timeline";
import { durationParts } from "@/lib/derive";
import { updateIncidentAction, updateEventLotAction, updateEventChangeTypeAction, addEventCommentAction, updateEventTagsAction, updateEventDateAction, updateEventHourTypeAction, updateEventCausedByAction } from "@/app/actions/events";
import { buildUrl } from "@/lib/buildUrl";
import { STATUS_META } from "@/lib/deployStatusMeta";
import type { DeployStatus } from "@prisma/client";
import { DeployTimeline } from "./DeployTimeline";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { actionMessage, changeTypeLabel, phaseLabel, rollbackText } from "@/i18n/labels";
import styles from "./EventDrawer.module.css";

function truncate(s: string, n = 48): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Comment thread: legacy single note (if any) + all thread comments + an add box. */
function Comments({ event, path, canWrite = true }: { event: ClientEvent; path: string; canWrite?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();
  const { stampShort } = useTimeFormat();
  return (
    <div className={styles.section}>
      <h2 className={styles.secTitle}>{t("drawer.comments")}</h2>
      <div className={styles.commentList}>
        {event.comment && (
          <div className={styles.commentItem}>
            <span className={styles.commentMeta}>{t("drawer.note")}</span>
            <div>{event.comment}</div>
          </div>
        )}
        {event.comments.map((c) => (
          <div key={c.id} className={styles.commentItem}>
            <span className={styles.commentMeta}>{c.author ?? "—"} · {stampShort(c.createdAt)}</span>
            <div>{c.body}</div>
          </div>
        ))}
        {!event.comment && event.comments.length === 0 && <p className={styles.commentMeta}>{t("drawer.noComment")}</p>}
      </div>
      {canWrite && (
        <div className={styles.commentAdd}>
          <textarea className={styles.commentArea} rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("drawer.addComment")} />
          <button
            className={styles.saveBtn}
            disabled={pending || !body.trim()}
            onClick={() => {
              setErr(null);
              startTransition(async () => {
                const res = await addEventCommentAction({ eventId: event.id, body, path });
                if (res.ok) { setBody(""); router.refresh(); } else setErr(actionMessage(t, res));
              });
            }}
          >
            {pending ? t("common.loading") : t("drawer.send")}
          </button>
        </div>
      )}
      {err && <p className={styles.error}>{err}</p>}
    </div>
  );
}

/** Editable tags: chips (× to remove) + an add field with suggestions from existing tags. */
function Tags({ event, path, suggestions, canWrite = true }: { event: ClientEvent; path: string; suggestions: string[]; canWrite?: boolean }) {
  const router = useRouter();
  const [list, setList] = useState<string[]>(event.tags);
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/v1/tags").then((r) => r.json()).then((rows: { slug: string; name: string; color: string }[]) => {
      const m: Record<string, string> = {};
      for (const t of rows) { m[t.slug] = t.color; m[t.name] = t.color; }
      setTagColors(m);
      // Cosmetic on purpose: a failure here only means uncoloured tag chips.
    }).catch(() => {});
  }, []);
  const colorOf = (t: string) => tagColors[t] ?? tagColors[slugify(t)] ?? null;
  const typed = input.trim();
  const effective = typed && !list.includes(typed) ? [...list, typed] : list;
  const dirty = effective.join(" ") !== event.tags.join(" ");
  const add = () => {
    const t = input.trim();
    if (t && !list.includes(t)) setList([...list, t]);
    setInput("");
  };
  return (
    <div className={styles.section}>
      <h2 className={styles.secTitle}>{t("form.tags")}</h2>
      <div className={styles.tagChips}>
        {list.map((t) => (
          <span key={t} className={styles.tagChip} style={colorOf(t) ? { background: colorOf(t)!, color: "#fff" } : undefined}>
            {t}
            {canWrite && <button type="button" onClick={() => setList(list.filter((x) => x !== t))} aria-label={`retirer ${t}`}>×</button>}
          </span>
        ))}
        {list.length === 0 && <span className={styles.commentMeta}>{t("drawer.noTag")}</span>}
      </div>
      {canWrite && (
      <div className={styles.tagAdd}>
        <input
          list="tag-suggestions"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={t("form.addTag")}
        />
        <datalist id="tag-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <button type="button" onClick={add}>+</button>
        <button
          className={styles.saveBtn}
          disabled={pending || !dirty}
          onClick={() => {
            setErr(null);
            startTransition(async () => {
              const res = await updateEventTagsAction({ eventId: event.id, tags: effective, path });
              if (res.ok) { setList(effective); setInput(""); router.refresh(); }
              else setErr(actionMessage(t, res));
            });
          }}
        >
          {pending ? t("common.loading") : t("common.save")}
        </button>
      </div>
      )}
      {err && <p className={styles.error}>{err}</p>}
    </div>
  );
}

/** Edit an event's date (occurredAt). */
function DateEdit({ event, path }: { event: ClientEvent; path: string }) {
  const router = useRouter();
  const { toInput, fromInput } = useTimeFormat();
  const [val, setVal] = useState(toInput(event.occurredAt));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();
  const dirty = val !== toInput(event.occurredAt);
  return (
    <div className={styles.dateEdit}>
      <span className={styles.key}>{t("common.date")}</span>
      <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} />
      <button
        className={styles.saveBtn}
        disabled={pending || !dirty || !val}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const res = await updateEventDateAction({ eventId: event.id, occurredAt: fromInput(val), path });
            if (res.ok) router.refresh();
            else setErr(actionMessage(t, res));
          });
        }}
      >
        {pending ? t("common.loading") : t("common.ok")}
      </button>
      {err && <span className={styles.error}>{err}</span>}
    </div>
  );
}

function HourEdit({ event, path }: { event: ClientEvent; path: string }) {
  const router = useRouter();
  const [val, setVal] = useState(event.hourType ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();
  return (
    <div className={styles.dateEdit}>
      <span className={styles.key}>{t("form.hourType")}</span>
      <select
        value={val}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setVal(next);
          setErr(null);
          if (next === (event.hourType ?? "")) return;
          startTransition(async () => {
            const res = await updateEventHourTypeAction({ eventId: event.id, hourType: next, path });
            if (res.ok) router.refresh();
            else setErr(actionMessage(t, res));
          });
        }}
      >
        <option value="">—</option>
        <option value="HO">{t("form.hoLong")}</option>
        <option value="HNO">{t("form.hnoLong")}</option>
      </select>
      {err && <span className={styles.error}>{err}</span>}
    </div>
  );
}

/** A candidate cause fetched for the "caused by" picker (same product, before this event). */
type CausalOption = { id: string; type: string; environment: string; version: string | null; occurredAt: string; serviceSlug: string };

/** One resolved end of a causal link — always carries its service, since a cause
 *  or effect may live on a sibling service of the same product. */
export type CausalEntry = { id: string; type: string; environment: string; version: string | null; occurredAt: string; serviceSlug: string };
export type CausalInfo = { causedBy?: CausalEntry; led: CausalEntry[] };

/** Read-only causal links, plus (when editable) a select to set/clear the cause.
 *  `causal` is resolved product-wide against the database by the page's data path
 *  (see getCausalSummaries in @/lib/causal) — never derived from `all`, which is
 *  only this service's own events and would silently miss any cross-service link.
 *  Candidates for the picker are still fetched lazily on first focus, mirroring the
 *  Tags component's `fetch("/api/v1/tags")` on-demand pattern rather than paying
 *  that query for every event in the feed whether or not anyone edits it. */
function Causal({
  event,
  all,
  causal,
  path,
  editable,
  onOpenEvent,
}: {
  event: ClientEvent;
  all: ClientEvent[];
  causal: CausalInfo;
  path?: string;
  editable: boolean;
  onOpenEvent?: (id: string) => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { stampShort } = useTimeFormat();
  const [options, setOptions] = useState<CausalOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [val, setVal] = useState(event.causedById ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadOptions() {
    if (options || loading) return;
    setLoading(true);
    fetch(`/api/v1/events/by-id/${event.id}/causal-candidates`)
      .then((r) => r.json())
      .then((rows: CausalOption[]) => setOptions(rows))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }

  const optionLabel = (o: CausalOption) =>
    `${o.serviceSlug} · ${o.type} · ${o.environment}${o.version ? ` v${o.version}` : ""} · ${stampShort(o.occurredAt)}`;
  const entryLabel = (e: CausalEntry) => `${e.serviceSlug} · ${e.type} (${e.environment})`;
  // The currently-linked cause may fall outside the candidate window (e.g. an
  // older link) — keep it selectable even when it's missing from `options`.
  const currentUnlisted = val && !options?.some((o) => o.id === val);
  // A causal reference only opens in this drawer when it's one of the events this
  // page already loaded (same service, in-window); a cross-service or out-of-window
  // one still displays fully, just not as a dead/no-op click into nothing.
  const openable = (id: string) => all.some((e) => e.id === id);

  return (
    <div className={styles.section}>
      <h2>{t("drawer.causality")}</h2>
      {causal.causedBy && (
        <p className={styles.causal}>
          caused by →{" "}
          {openable(causal.causedBy.id) ? (
            <button type="button" className={styles.linkBtn} onClick={() => onOpenEvent?.(causal.causedBy!.id)}>
              {entryLabel(causal.causedBy)}
            </button>
          ) : (
            <span>{entryLabel(causal.causedBy)}</span>
          )}
        </p>
      )}
      {causal.led.map((l) => (
        <p key={l.id} className={styles.causal}>
          led to ←{" "}
          {openable(l.id) ? (
            <button type="button" className={styles.linkBtn} onClick={() => onOpenEvent?.(l.id)}>
              {entryLabel(l)}
            </button>
          ) : (
            <span>{entryLabel(l)}</span>
          )}
        </p>
      ))}
      {editable && (
        <div className={styles.dateEdit}>
          <span className={styles.key}>{t("drawer.causedBySelect")}</span>
          <select
            value={val}
            disabled={pending}
            onFocus={loadOptions}
            onChange={(e) => {
              const next = e.target.value;
              setVal(next);
              setErr(null);
              if (next === (event.causedById ?? "")) return;
              startTransition(async () => {
                const res = await updateEventCausedByAction({ eventId: event.id, causeId: next || null, path: path! });
                if (res.ok) {
                  router.refresh();
                } else {
                  setErr(actionMessage(t, res));
                  setVal(event.causedById ?? ""); // server rejected it — don't leave an optimistic value that didn't stick
                }
              });
            }}
          >
            <option value="">{t("drawer.causeNone")}</option>
            {currentUnlisted && (
              // Resolved via `causal.causedBy` whenever the link is visible to us; the
              // only way to land here without it is a link to a row we may not see
              // (soft-deleted, or hidden by visibility rules) — never show the raw id.
              <option value={val}>{causal.causedBy ? entryLabel(causal.causedBy) : t("drawer.causeUnknown")}</option>
            )}
            {loading && <option disabled>{t("common.loading")}</option>}
            {options?.map((o) => (
              <option key={o.id} value={o.id}>{optionLabel(o)}</option>
            ))}
          </select>
          {pending && <span className={styles.typeSaving}>…</span>}
        </div>
      )}
      {err && <p className={styles.error}>{err}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className={styles.row}>
      <span className={styles.key}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

export function EventDrawer({
  event,
  all,
  path,
  onClose,
  lotMembers = [],
  lotWarning = [],
  buildUrlTemplate = null,
  envWorkflow = [],
  envColors = {},
  onNewPhase,
  onOpenEvent,
  canWrite = true,
  causal = { led: [] },
  changelogHtml = null,
}: {
  event: ClientEvent;
  all: ClientEvent[];
  path?: string;
  onClose: () => void;
  lotMembers?: import("@/lib/deployLot").LotMember[];
  /** Labels of lot members not rolled back while the master app was — shows a warning. */
  lotWarning?: string[];
  buildUrlTemplate?: string | null;
  envWorkflow?: string[];
  envColors?: Record<string, string>;
  onNewPhase?: (changeType: string, parentId: string) => void;
  onOpenEvent?: (id: string) => void;
  canWrite?: boolean;
  /** Product-wide causal resolution for this event, computed server-side (see
   *  getCausalSummaries in @/lib/causal). Defaults to "no links" so callers that
   *  haven't wired it through yet degrade to "block hidden", not a crash. */
  causal?: CausalInfo;
  /** Note de release de la version deployee, deja rendue et assainie au serveur.
   *  null quand il n'y en a pas -- ou quand le reglage de visibilite la retire. */
  changelogHtml?: string | null;
}) {
  // Anonymous / read-only visitors see the full detail but no mutating controls.
  const editable = canWrite && !!path;
  // Follow this build across environments + check the env workflow.
  const trace = useMemo(
    () => (event.type === "DEPLOYMENT" && event.version ? traceRelease(all, event.version, envWorkflow) : null),
    [all, event.type, event.version, envWorkflow],
  );
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();
  const { stampShort, stampFull, toInput, fromInput } = useTimeFormat();

  // Incident editing (status + end time)
  const INCIDENT_STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
  const initialStatus =
    (event.incidentStatus as (typeof INCIDENT_STATUSES)[number] | null) ??
    (event.resolvedAt ? "RESOLVED" : "INVESTIGATING");
  const [incStatus, setIncStatus] = useState<(typeof INCIDENT_STATUSES)[number]>(initialStatus);
  const [endInput, setEndInput] = useState(event.resolvedAt ? toInput(event.resolvedAt) : "");
  const [incError, setIncError] = useState<string | null>(null);
  const [lotInput, setLotInput] = useState(event.lot ?? "");
  const [lotErr, setLotErr] = useState<string | null>(null);
  const [changeInput, setChangeInput] = useState(event.changeType ?? "NORMAL");
  const [changeErr, setChangeErr] = useState<string | null>(null);
  const [buildDetails, setBuildDetails] = useState(false);
  const tagSuggestions = useMemo(() => [...new Set(all.flatMap((e) => e.tags))].sort(), [all]);
  const isPhase = event.changeType === "PRE_MEP" || event.changeType === "POST_MEP";
  const isMepParent = event.type === "DEPLOYMENT" && (event.changeType === "NORMAL" || event.changeType === "HOTFIX");
  const phases = useMemo(() => all.filter((e) => e.parentId === event.id && (e.changeType === "PRE_MEP" || e.changeType === "POST_MEP")), [all, event.id]);
  const parentEvent = event.parentId ? all.find((e) => e.id === event.parentId) : undefined;
  const preWarn = isMepParent
    && (event.deployStatus === null || ["SCHEDULED", "GO_CONFIRMED", "PENDING"].includes(event.deployStatus ?? ""))
    && phases.some((p) => p.changeType === "PRE_MEP" && p.deployStatus !== "VALIDATE");
  // All deployments of this build (same version), for the trace timeline + details list.
  const buildMeps = useMemo(
    () => all.filter((e) => e.type === "DEPLOYMENT" && event.version && e.version === event.version)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1)),
    [all, event.version],
  );
  const panelRef = useRef<HTMLDivElement>(null);
  useModalDismiss(panelRef, onClose);

  function saveIncident() {
    if (!path) return;
    setIncError(null);
    const resolvedAt =
      incStatus === "RESOLVED" ? (endInput ? fromInput(endInput) : new Date().toISOString()) : undefined;
    startTransition(async () => {
      const res = await updateIncidentAction({ eventId: event.id, path, status: incStatus, resolvedAt });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setIncError(actionMessage(t, res));
      }
    });
  }

  const incStart = event.startedAt ? new Date(event.startedAt) : null;
  const incEnd = event.resolvedAt ? new Date(event.resolvedAt) : new Date();
  const dur = incStart ? durationParts(incStart, incEnd) : null;
  const build = buildUrl(buildUrlTemplate, event.version);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label={t("common.close")}>×</button>
        {event.type === "DEPLOYMENT" ? (
          <div className={styles.hdr}>
            <span className={styles.hdrEnv} style={{ background: envColors[event.environment] ?? "#64748b" }}>{event.environment}</span>
            {editable ? (
              <select
                className={styles.typeSelect}
                value={changeInput}
                onChange={(e) => {
                  const next = e.target.value;
                  setChangeInput(next);
                  setChangeErr(null);
                  if (!path || next === (event.changeType ?? "NORMAL")) return;
                  startTransition(async () => {
                    const res = await updateEventChangeTypeAction({ eventId: event.id, changeType: next, path });
                    if (res.ok) router.refresh();
                    else setChangeErr(actionMessage(t, res));
                  });
                }}
              >
                <option value="NORMAL">{changeTypeLabel(t, "NORMAL")}</option>
                <option value="HOTFIX">{changeTypeLabel(t, "HOTFIX")}</option>
                {event.changeType === "POSTMEP_SQL" && <option value="POSTMEP_SQL">{changeTypeLabel(t, "POSTMEP_SQL")}</option>}
                {/* PRE_MEP/POST_MEP can only be entered by reclassifying an event that is
                    already a phase (see setEventChangeType) — offering them otherwise would
                    just produce a server rejection, so they're only listed here when isPhase. */}
                {isPhase && <option value="PRE_MEP">{changeTypeLabel(t, "PRE_MEP")}</option>}
                {isPhase && <option value="POST_MEP">{changeTypeLabel(t, "POST_MEP")}</option>}
              </select>
            ) : (
              <span className={styles.hdrPhase}>{changeTypeLabel(t, event.changeType)}</span>
            )}
            {event.externalLink && (
              <a className={styles.hdrLink} href={event.externalLink} target="_blank" rel="noreferrer" title={t("drawer.externalLink")}>{t("drawer.link")}</a>
            )}
            {pending && <span className={styles.typeSaving}>…</span>}
            {changeErr && <span className={styles.error}>{changeErr}</span>}
          </div>
        ) : (
          <h2>{event.type}</h2>
        )}

        {event.type === "DEPLOYMENT" && path ? (
          <>
            <div className={styles.metaLine}>
              <b>{event.deployStatus ?? event.derived.status ?? "—"}</b>
              {" · "}{stampShort(event.occurredAt)}
              {event.requester ? ` · ${event.requester}` : ""}
              {event.version ? ` · v${event.version}` : ""}
              {event.hourType ? ` · ${t(`hour.${event.hourType}`)}` : ""}
              {build && <> · <a href={build} target="_blank" rel="noreferrer">build</a></>}
            </div>

            {isPhase && parentEvent && (
              <div className={styles.metaLine}>
                {t("drawer.linkedTo")}{" "}
                <button type="button" className={styles.linkBtn} onClick={() => onOpenEvent?.(parentEvent.id)}>
                  {changeTypeLabel(t, parentEvent.changeType)} {parentEvent.environment}{parentEvent.version ? ` v${parentEvent.version}` : ""}
                </button>
              </div>
            )}

            {isMepParent && onNewPhase && editable && (
              <div className={styles.phaseActions}>
                <button type="button" className={styles.phaseBtn} onClick={() => onNewPhase("PRE_MEP", event.id)}>{t("form.addPhase", { type: changeTypeLabel(t, "PRE_MEP") })}</button>
                <button type="button" className={styles.phaseBtn} onClick={() => onNewPhase("POST_MEP", event.id)}>{t("form.addPhase", { type: changeTypeLabel(t, "POST_MEP") })}</button>
              </div>
            )}

            {preWarn && (
              <div className={styles.warn}>{t("drawer.preWarn")}</div>
            )}

            {editable && <DateEdit event={event} path={path} />}
            {editable && <HourEdit event={event} path={path} />}

            <div className={styles.section}>
              <DeployTimeline event={event} path={path} canWrite={editable} />
            </div>

            {changelogHtml && (
              <div className={styles.section}>
                {/* Repliee : la note peut etre longue, et le drawer sert d'abord a
                    lire l'etat du deploiement. */}
                <details>
                  <summary className={styles.secTitle}>{t("changelog.title")}</summary>
                  <ChangelogBody html={changelogHtml} />
                  {path && (
                    <Link href={`${path}/changelog`} className={styles.changelogAll}>
                      {t("changelog.viewAll")}
                    </Link>
                  )}
                </details>
              </div>
            )}

            {isMepParent && phases.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.secTitle}>{t("drawer.phases")}</h2>
                <div className={styles.buildList}>
                  {phases.map((ph) => (
                    <button type="button" key={ph.id} className={styles.buildRow} onClick={() => onOpenEvent?.(ph.id)}>
                      <span className={styles.hdrPhase}>{phaseLabel(t, ph.changeType === "PRE_MEP" ? "PRE" : "POST")}</span>
                      <span className={styles.buildEnv} style={{ background: envColors[ph.environment] ?? "#64748b" }}>{ph.environment}</span>
                      <span className={styles.buildDate}>{ph.version ? `v${ph.version}` : ""} {ph.deployStatus ?? ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Comments event={event} path={path} canWrite={editable} />

            <Tags event={event} path={path} suggestions={tagSuggestions} canWrite={editable} />

            {trace && (
              <div className={styles.section}>
                <hr className={styles.sep} />
                <div className={styles.secHead}>
                  <h2 className={styles.secTitle}>{t("drawer.buildTrace")} {event.version ?? ""}</h2>
                  <button type="button" className={styles.detailsToggle} onClick={() => setBuildDetails((v) => !v)}>
                    {buildDetails ? t("drawer.detailsHide") : t("drawer.detailsShow")}
                  </button>
                </div>

                {trace.workflow.length > 0 ? (
                  <div className={styles.wfTrace}>
                    {trace.workflow.map((env, i) => {
                      const step = trace.steps.find((s) => s.environment === env);
                      return (
                        <div key={env} className={styles.wfStep}>
                          {i > 0 && <span className={styles.wfConn} data-reached={!!step} />}
                          {step ? (
                            <a
                              className={styles.wfNode}
                              style={{ background: envColors[env] ?? "#64748b" }}
                              href={`${path}?event=${step.eventId}`}
                              target="_blank"
                              rel="noreferrer"
                              title={`${env} — ${stampFull(step.occurredAt)} · ${t("drawer.openMep")}`}
                            >
                              {env}
                            </a>
                          ) : (
                            <span className={styles.wfNodeOff} title={`${env} — non atteint`}>{env}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.traceNote}>{t("drawer.noWorkflow")}</p>
                )}

                {trace.respected === false ? (
                  <p className={styles.traceBad}>{t("drawer.workflowBad")} {trace.issues.join(" ; ")}</p>
                ) : trace.respected ? (
                  <p className={styles.traceOk}>{t("drawer.workflowOk")}</p>
                ) : null}

                {buildDetails && (
                  <div className={styles.buildList}>
                    {buildMeps.map((e) => (
                      <a key={e.id} className={styles.buildRow} href={`${path}?event=${e.id}`} target="_blank" rel="noreferrer">
                        <span className={styles.buildEnv} style={{ background: envColors[e.environment] ?? "#64748b" }}>{e.environment}</span>
                        <span className={styles.buildDate}>{stampShort(e.occurredAt)}</span>
                        <span className={styles.buildComment}>{truncate(e.comment ?? "")}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.section}>
              {editable ? (
                <div className={styles.lotLine}>
                  <span className={styles.secTitle}>{t("drawer.lot")}</span>
                  <input className={styles.lotInput} value={lotInput} onChange={(e) => setLotInput(e.target.value)} placeholder={t("drawer.lotKey")} />
                  <button
                    className={styles.saveBtn}
                    disabled={pending}
                    onClick={() => {
                      setLotErr(null);
                      startTransition(async () => {
                        const res = await updateEventLotAction({ eventId: event.id, lot: lotInput, path: path! });
                        if (res.ok) router.refresh();
                        else setLotErr(actionMessage(t, res));
                      });
                    }}
                  >
                    {pending ? t("common.loading") : t("common.ok")}
                  </button>
                </div>
              ) : (
                event.lot && <div className={styles.lotLine}><span className={styles.secTitle}>{t("drawer.lot")}</span> {event.lot}</div>
              )}
              {lotErr && <p className={styles.error}>{lotErr}</p>}
              {lotWarning.length > 0 && (
                <p className={styles.lotRollbackWarn} role="alert">
                  ⚠ Rollback du lot incomplet — l&apos;app principale a été rollback, mais ces apps ne l&apos;ont pas été : {lotWarning.join(", ")}
                </p>
              )}
              {lotMembers.length > 0 && (
                <div className={styles.lotMembers}>
                  {lotMembers.map((m) => (
                    <div key={m.eventId} className={styles.lotRow}>
                      <span>{m.product} / {m.service}</span>
                      <span className={styles.lotVer}>{m.version ? `v${m.version}` : ""}</span>
                      <span className={styles.lotEnv}>{m.environment}</span>
                      {m.deployStatus && (
                        <span className="deployPill" style={{ background: STATUS_META[m.deployStatus as DeployStatus].color }}>
                          {STATUS_META[m.deployStatus as DeployStatus].label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Row k={t("drawer.env")} v={event.environment} />
            <Row k={t("drawer.when")} v={stampFull(event.occurredAt)} />
            {editable && <DateEdit event={event} path={path!} />}
            <Row k="Incident" v={event.incidentType} />
            <Row k={t("drawer.durationMin")} v={event.derived.minutes} />
            <Row
              k={t("drawer.window")}
              v={event.windowStart ? `${stampFull(event.windowStart)} → ${event.windowEnd ? stampFull(event.windowEnd) : "?"}` : null}
            />
            {event.externalLink && (
              <Row k="Link" v={<a href={event.externalLink} target="_blank" rel="noreferrer">open</a>} />
            )}
            {path ? (
              <Tags event={event} path={path} suggestions={tagSuggestions} canWrite={editable} />
            ) : (
              event.tags.length > 0 && <Row k="Tags" v={event.tags.join(", ")} />
            )}
            {path && <Comments event={event} path={path} canWrite={editable} />}
          </>
        )}

        {event.type === "INCIDENT" && (
          <div className={styles.section}>
            <h2>{t("drawer.incident")}</h2>
            <Row k={t("common.status")} v={event.incidentStatus ?? (event.resolvedAt ? "RESOLVED" : "INVESTIGATING")} />
            <Row k={t("drawer.incStart")} v={incStart ? stampFull(incStart) : null} />
            <Row k={t("drawer.incEnd")} v={event.resolvedAt ? stampFull(event.resolvedAt) : t("drawer.ongoing")} />
            {dur && <Row k={t("drawer.duration")} v={dur.label} />}

            {editable && (
              <div className={styles.editForm}>
                <label className={styles.editLabel}>
                  {t("common.status")}
                  <select value={incStatus} onChange={(e) => setIncStatus(e.target.value as (typeof INCIDENT_STATUSES)[number])}>
                    {INCIDENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {incStatus === "RESOLVED" && (
                  <label className={styles.editLabel}>
                    {t("drawer.incEnd")}
                    <input type="datetime-local" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
                  </label>
                )}
                <button className={styles.saveBtn} onClick={saveIncident} disabled={pending}>
                  {pending ? t("drawer.saving") : t("common.save")}
                </button>
                {incError && <p className={styles.error}>{incError}</p>}
              </div>
            )}
          </div>
        )}

        {(causal.causedBy || causal.led.length > 0 || editable) && (
          <Causal event={event} all={all} causal={causal} path={path} editable={editable} onOpenEvent={onOpenEvent} />
        )}

        {event.rollbacks.length + event.qaValidations.length + event.observations.length > 0 && (
          <div className={styles.section}>
            <h2>{t("drawer.annotations")}</h2>
            {event.rollbacks.map((r) => (
              <p key={r.id}>Rollback: {rollbackText(t, r)}{r.actorName ? ` (${t("common.byActor", { who: r.actorName })})` : ""}{r.link ? ` (${r.link})` : ""}</p>
            ))}
            {event.qaValidations.map((q) => (
              <p key={q.id}>QA by {q.validatedBy}{q.comment ? `: ${q.comment}` : ""}</p>
            ))}
            {event.observations.map((o) => (
              <p key={o.id}>Observation by {o.who} ({o.durationMinutes}m){o.comment ? `: ${o.comment}` : ""}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
