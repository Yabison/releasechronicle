import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Markdown → HTML sûr à injecter.
 *
 * Le contenu vient de la CI comme de l'interface : les deux sont des entrées non
 * fiables, donc l'assainissement n'est pas optionnel — et il n'est pas écrit à la
 * main, l'échappement HTML étant exactement ce qu'on rate en le bricolant.
 *
 * Seul le Markdown source est stocké, si bien qu'un durcissement de cette liste
 * s'applique rétroactivement à toutes les notes au prochain rendu.
 */
export function renderChangelog(markdown: string): string {
  const raw = marked.parse(markdown, { async: false, gfm: true });
  return sanitizeHtml(raw, {
    allowedTags: [
      "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "strong", "em", "del",
      "code", "pre", "blockquote", "hr", "br", "a",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    // Pas d'img : une note affichée irait chercher la ressource, ce qui signale
    // à son hôte qui lit quoi et quand.
    allowedAttributes: { a: ["href", "rel", "target"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      // Rétrograder plutôt que retirer : sanitize-html supprime la balise ET son
      // texte, donc un `# Titre` perdrait son titre au lieu de le déclasser.
      h1: sanitizeHtml.simpleTransform("h3", {}),
      h2: sanitizeHtml.simpleTransform("h4", {}),
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}
