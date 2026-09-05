import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/i18n/server";
import { loadServiceChangelog } from "@/lib/changelogPage";
import { ChangelogBody } from "@/components/ChangelogBody";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ company: string; product: string; service: string }>;
}) {
  const { company, product, service } = await params;
  const [session, t] = await Promise.all([getSession(), getServerT()]);

  // Une seule sortie pour « n'existe pas » et « pas le droit » : distinguer les
  // deux dirait déjà qu'il existe.
  const page = await loadServiceChangelog({ company, product, service, session });
  if (!page) notFound();

  const servicePath = `/${company}/${product}/${service}`;
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Link href={servicePath} className={styles.back}>{t("changelog.back")}</Link>
        <h1 className={styles.title}>{t("changelog.title")}</h1>
        <span className={styles.crumb}>{product} / {service}</span>
      </div>

      {page.notes.length === 0 ? (
        <p className={styles.empty}>{t("changelog.empty")}</p>
      ) : (
        page.notes.map((n) => (
          <article key={n.version} className={styles.release}>
            <div className={styles.releaseHead}>
              <h2 className={styles.version}>{n.version}</h2>
              <time className={styles.meta} dateTime={n.updatedAt.toISOString()}>
                {n.updatedAt.toISOString().slice(0, 10)}
              </time>
              {n.source === "UI" && (
                <span className={styles.handEdited}>
                  {n.authorName ? t("changelog.handEditedBy", { name: n.authorName }) : t("changelog.handEdited")}
                </span>
              )}
            </div>
            <ChangelogBody html={n.html} />
          </article>
        ))
      )}
    </div>
  );
}
