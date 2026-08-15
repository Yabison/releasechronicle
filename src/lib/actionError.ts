/** Failure shape returned by server actions: an i18n key plus its interpolation
 *  variables, so the client renders the message in the user's locale. */
export type ActionFailure = { ok: false; error: string; vars?: Record<string, string | number> };

/** Build a failure from an `err.*` catalog key. */
export function fail(key: string, vars?: Record<string, string | number>): ActionFailure {
  return vars ? { ok: false, error: key, vars } : { ok: false, error: key };
}
