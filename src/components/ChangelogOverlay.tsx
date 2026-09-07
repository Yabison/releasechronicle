"use client";

import { useEffect, useRef, useState } from "react";
import { loadChangelogAction } from "@/app/actions/changelog";
import type { RenderedNote } from "@/lib/changelogPage";
import { ChangelogBody } from "./ChangelogBody";
import { useModalDismiss } from "@/lib/useModalDismiss";
import { actionMessage } from "@/i18n/labels";
import { useI18n } from "@/i18n/useI18n";
import styles from "./ChangelogOverlay.module.css";

/**
 * Les notes de release d'un service, en fenêtre plein écran par-dessus tout.
 *
 * Les notes sont chargées à l'ouverture, pas avec la page : la plupart des
 * visites de la timeline ne les ouvrent jamais, et les sérialiser d'office
 * ferait payer à tout le monde un contenu que presque personne ne demande. Le
 * rendu Markdown et l'assainissement restent au serveur (loadChangelogAction) —
 * les faire ici embarquerait le moteur et une décision de sécurité dans le
 * navigateur du lecteur.
 */
export function ChangelogOverlay({
  company,
  product,
  service,
  productName,
  serviceName,
  focusVersion = null,
  onClose,
}: {
  company: string;
  product: string;
  service: string;
  productName: string;
  serviceName: string;
  /** Version sur laquelle se placer en s'ouvrant -- celle du deploiement d'ou
   *  l'on vient. null quand la fenetre est ouverte depuis l'en-tete. */
  focusVersion?: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalDismiss(panelRef, onClose);
  const [notes, setNotes] = useState<RenderedNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLElement>(null);

  // Ouverte depuis un deploiement, la fenetre se place sur SA version : sinon on
  // atterrit en haut d'une liste de dizaines de notes et il faut chercher celle
  // qu'on venait justement de demander.
  useEffect(() => {
    if (!notes || !focusVersion) return;
    focusRef.current?.scrollIntoView({ block: "start" });
  }, [notes, focusVersion]);

  useEffect(() => {
    let live = true;
    loadChangelogAction({ company, product, service })
      .then((res) => {
        if (!live) return;
        if (res.ok) setNotes(res.notes);
        else setError(actionMessage(t, res));
      })
      .catch(() => { if (live) setError(t("common.loadFailed")); });
    return () => { live = false; };
    // `t` change à chaque rendu du provider : le remettre en dépendance
    // relancerait le chargement pour rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, product, service]);

  return (
    <div ref={panelRef} className={styles.overlay} role="dialog" aria-modal="true" aria-label={t("changelog.title")}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t("changelog.title")}</h1>
        <span className={styles.crumb}>{productName} / {serviceName}</span>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t("common.close")}>×</button>
      </div>

      <div className={styles.body}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!error && notes === null && <p className={styles.muted}>{t("common.loading")}</p>}
        {notes?.length === 0 && <p className={styles.muted}>{t("changelog.empty")}</p>}
        {notes?.map((n) => (
          <article
            key={n.version}
            ref={n.version === focusVersion ? focusRef : undefined}
            className={styles.release}
            data-focus={n.version === focusVersion ? "true" : undefined}
          >
            <div className={styles.releaseHead}>
              <h2 className={styles.version}>{n.version}</h2>
              <time className={styles.meta} dateTime={new Date(n.updatedAt).toISOString()}>
                {new Date(n.updatedAt).toISOString().slice(0, 10)}
              </time>
              {n.source === "UI" && (
                <span className={styles.handEdited}>
                  {n.authorName ? t("changelog.handEditedBy", { name: n.authorName }) : t("changelog.handEdited")}
                </span>
              )}
            </div>
            <ChangelogBody html={n.html} />
          </article>
        ))}
      </div>
    </div>
  );
}
