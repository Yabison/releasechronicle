import type { TimeMode } from "./dateDisplay";

/**
 * Where the timestamp display mode is kept.
 *
 * A cookie, not localStorage. The server has to know it to render the first
 * frame — otherwise every page paints UTC and flips to local after mount — and
 * a preference stored per user in the database can only reach the renderer
 * through something the server reads. localStorage is neither.
 */
export const TIME_COOKIE = "rc_time_mode";
export const DEFAULT_TIME_MODE: TimeMode = "local";

export function isTimeMode(x: unknown): x is TimeMode {
  return x === "local" || x === "utc";
}

export function timeModeFromCookieValue(value: string | null | undefined): TimeMode {
  return isTimeMode(value) ? value : DEFAULT_TIME_MODE;
}
