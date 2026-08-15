"use client";

import { useRef, useState, useTransition, useMemo, useEffect } from "react";
import { slugify } from "@/lib/slug";
import { traceRelease } from "@/lib/releaseTrace";
import { useRouter } from "next/navigation";
import { useModalDismiss } from "@/lib/useModalDismiss";
import type { ClientEvent } from "@/lib/timeline";
import { resolveCausal } from "@/lib/timeline";
import { durationParts } from "@/lib/derive";
import { updateIncidentAction, updateEventLotAction, updateEventChangeTypeAction, addEventCommentAction, updateEventTagsAction, updateEventDateAction, updateEventHourTypeAction } from "@/app/actions/events";
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
}) {
  // Anonymous / read-only visitors see the full detail but no mutating controls.
  const editable = canWrite && !!path;
  const causal = resolveCausal(event, all);
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
            {isPhase ? (
              <span className={styles.hdrPhase}>{changeTypeLabel(t, event.changeType)}</span>
            ) : editable ? (
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

        {(causal.causedBy || causal.led.length > 0) && (
          <div className={styles.section}>
            <h2>{t("drawer.causality")}</h2>
            {causal.causedBy && <p className={styles.causal}>caused by → {causal.causedBy.type} ({causal.causedBy.environment})</p>}
            {causal.led.map((l) => (
              <p key={l.id} className={styles.causal}>led to ← {l.type} ({l.environment})</p>
            ))}
          </div>
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
