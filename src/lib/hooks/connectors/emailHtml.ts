/**
 * The HTML half of a notification mail.
 *
 * Sent alongside the plain text, not instead of it: multipart/alternative, so a
 * client that shows text — or a reader who has chosen to — still gets the same
 * message. The HTML exists for one thing the text cannot do, which is turn the
 * action link into a button.
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

export function emailHtml({
  body,
  actionUrl,
  actionLabel,
}: {
  body: string;
  actionUrl: string;
  actionLabel: string;
}): string {
  // The link is already spelled out in the text part; in HTML it becomes the
  // button, so the line that held it is dropped to avoid saying it twice.
  const lines = body
    .split("\n")
    .filter((line) => !(actionUrl && line.includes(actionUrl)))
    .map((line) => escapeHtml(line));

  const button =
    actionUrl && isSafeActionUrl(actionUrl)
      ? `<tr><td style="padding:18px 0 4px">
      <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 18px;background:#3b5bdb;color:#ffffff;font-weight:600;border-radius:8px;text-decoration:none">${escapeHtml(actionLabel)}</a>
    </td></tr>`
      : "";

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#1f2328">
  <tr><td style="white-space:pre-wrap">${lines.join("\n")}</td></tr>
  ${button}
</table>`;
}
