export type CalItem = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
};

/** UTC timestamp in iCalendar basic format: YYYYMMDDTHHMMSSZ. */
function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escape a text value per RFC 5545 (backslash, semicolon, comma, newline). */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Build a VCALENDAR (text/calendar) document from calendar items. CRLF line endings. */
export function buildCalendar(items: CalItem[], now: Date = new Date()): string {
  const stamp = fmt(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//releasechronicle//calendar//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const it of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(it.start)}`,
      `DTEND:${fmt(it.end)}`,
      `SUMMARY:${esc(it.summary)}`,
    );
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
