/**
 * The one place timestamps get formatted.
 *
 * The UI used to mix three conventions — UTC getters in the list, browser-local in
 * the forms, `toLocaleString()` in the lots — so the same event read differently on
 * every screen. Everything now goes through here, driven by one display mode:
 * "local" (the visitor's timezone, the default) or "utc" (for teams coordinating
 * across zones). Full stamps name UTC explicitly; a local time needs no label.
 *
 * `timeZone` exists so tests can pin an IANA zone and stay deterministic; real
 * callers only pass `mode`.
 */
export type TimeMode = "local" | "utc";
export type TimeOpts = { mode: TimeMode; timeZone?: string; locale?: string };

function zoneOf(opts: TimeOpts): string | undefined {
  return opts.timeZone ?? (opts.mode === "utc" ? "UTC" : undefined);
}

type Parts = { year: string; month: string; day: string; hour: string; minute: string };

function partsOf(iso: string | Date, opts: TimeOpts): Parts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: zoneOf(opts),
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(iso))) out[p.type] = p.value;
  // en-GB can render midnight as "24:00"; keys and inputs need "00".
  if (out.hour === "24") out.hour = "00";
  return out as Parts;
}

/** "31/07" */
export function stampDay(iso: string | Date, opts: TimeOpts): string {
  const p = partsOf(iso, opts);
  return `${p.day}/${p.month}`;
}

/** "21:30" */
export function stampTime(iso: string | Date, opts: TimeOpts): string {
  const p = partsOf(iso, opts);
  return `${p.hour}:${p.minute}`;
}

/** "31/07 21:30" — the timeline row / trace format. */
export function stampShort(iso: string | Date, opts: TimeOpts): string {
  return `${stampDay(iso, opts)} ${stampTime(iso, opts)}`;
}

/** "31/07/2026 21:30", suffixed with "UTC" in utc mode so the reader knows. */
export function stampFull(iso: string | Date, opts: TimeOpts): string {
  const p = partsOf(iso, opts);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}${opts.mode === "utc" ? " UTC" : ""}`;
}

/** "2026-07-31" in the display timezone — for sameDay checks and day grouping. */
export function dayKey(iso: string | Date, opts: TimeOpts): string {
  const p = partsOf(iso, opts);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "2026-07" in the display timezone — month grouping must match the stamps. */
export function monthKey(iso: string | Date, opts: TimeOpts): string {
  const p = partsOf(iso, opts);
  return `${p.year}-${p.month}`;
}

/** "juillet 2026" / "July 2026" in the display timezone. */
export function monthLabel(iso: string | Date, opts: TimeOpts): string {
  return new Intl.DateTimeFormat(opts.locale ?? "fr", {
    timeZone: zoneOf(opts), month: "long", year: "numeric",
  }).format(new Date(iso));
}

/** Value for an <input type="datetime-local">, expressing the instant in the mode's timezone. */
export function toDatetimeInput(iso: string | Date, opts: TimeOpts): string {
  const p = partsOf(iso, opts);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Parse a datetime-local value back to an ISO instant. The input is naive, so the
 * mode says which timezone it was typed in: the browser's own, or UTC. Forms must
 * send THIS to the server — sending the naive string lets the server reinterpret
 * it in its own timezone, which is how 10:00 Paris used to become 10:00 UTC.
 */
export function fromDatetimeInput(value: string, mode: TimeMode): string {
  const d = mode === "utc" ? new Date(`${value}Z`) : new Date(value);
  return d.toISOString();
}
