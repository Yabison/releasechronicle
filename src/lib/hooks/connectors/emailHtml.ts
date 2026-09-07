/**
 * The HTML half of a notification mail.
 *
 * Sent alongside the plain text, not instead of it: multipart/alternative, so a
 * client that shows text — or a reader who has chosen to — still gets the same
 * message. The HTML exists for one thing the text cannot do, which is turn the
 * action link into a button.
 *
 * Two buttons at most: the one-click action, which only a deployment with a
 * next status has, and the event itself, which every notification now carries —
 * an incident or a maintenance used to arrive with no way back into the app.
 *
 * Deliberately crude markup. Mail clients strip <style> blocks, ignore flexbox
 * and drop external stylesheets, so everything is an inline attribute on a
 * table, which is the one layout every client still agrees on. No images, no
 * web fonts, nothing fetched: a notification must render the same in a locked
 * down client as in a browser.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** The body carries user-written comments, so it is escaped, never trusted. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * The action URL is signed and single-use, and it goes into an href — so it is
 * accepted only when it is an http(s) URL. Anything else (javascript:, data:)
 * yields no button rather than a link that does something else.
 */
export function isSafeActionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type MailLink = { url: string; label: string; primary?: boolean };

export function emailHtml({ body, links }: { body: string; links: MailLink[] }): string {
  const usable = links.filter((l) => l.url && isSafeActionUrl(l.url));

  // Each link is already spelled out in the text part; in HTML it becomes a
  // button, so the lines that held the raw URLs go.
  const lines = body
    .split("\n")
    .filter((line) => !usable.some((l) => line.includes(l.url)))
    .map((line) => escapeHtml(line));

  const buttons = usable
    .map((l) =>
      l.primary
        ? `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin-right:8px;padding:10px 18px;background:#3b5bdb;color:#ffffff;font-weight:600;border-radius:8px;text-decoration:none">${escapeHtml(l.label)}</a>`
        : `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin-right:8px;padding:10px 18px;border:1px solid #d0d3d9;color:#1f2328;border-radius:8px;text-decoration:none">${escapeHtml(l.label)}</a>`,
    )
    .join("");

  const row = buttons ? `<tr><td style="padding:18px 0 4px">${buttons}</td></tr>` : "";

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#1f2328">
  <tr><td style="white-space:pre-wrap">${lines.join("\n")}</td></tr>
  ${row}
</table>`;
}
