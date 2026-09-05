/**
 * HO / HNO classification for imported deployments.
 *
 * "Heures ouvrées" means 09:00-18:00, Monday to Friday, **Paris time** — that is
 * what the phrase means to the people who run the MEPs. The rundeck export is in
 * UTC, so comparing its hours directly would misfile every deployment in the hour
 * either side of the boundary, and a different hour in summer than in winter.
 * Intl does the conversion, DST included, without a dependency.
 */

const OPEN_HOUR = 9;
const CLOSE_HOUR = 18; // 18:00 sharp is already HNO.
const ZONE = "Europe/Paris";

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKEND = new Set(["Sat", "Sun"]);

export function hourType(at: Date): "HO" | "HNO" {
  const parts = fmt.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";

  if (WEEKEND.has(get("weekday"))) return "HNO";

  // "24" shows up for midnight in some ICU versions; it is night either way.
  const hour = Number(get("hour")) % 24;
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR ? "HO" : "HNO";
}
