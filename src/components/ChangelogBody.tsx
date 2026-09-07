import styles from "./ChangelogBody.module.css";

/**
 * Affiche une note déjà rendue.
 *
 * Le composant reçoit du HTML, pas du Markdown : le rendu et l'assainissement ont
 * lieu au serveur (`renderChangelog`), une fois, sur une liste de balises fermée.
 * Faire traverser le Markdown jusqu'ici embarquerait le moteur et l'assainisseur
 * dans le bundle client, et déplacerait une décision de sécurité dans le
 * navigateur du lecteur.
 */
export function ChangelogBody({ html }: { html: string }) {
  return <div className={styles.body} dangerouslySetInnerHTML={{ __html: html }} />;
}
