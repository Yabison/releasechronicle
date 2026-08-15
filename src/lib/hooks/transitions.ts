import { DEPLOY_ORDER } from "@/lib/deployWorkflow";

/** Serialize a from/to status pair as the stored filter token. */
export function transitionKey(from: string, to: string): string {
  return `${from}>${to}`;
}

/** The 4 adjacent forward pairs from DEPLOY_ORDER, as "FROM>TO" strings. */
export const TRANSITION_OPTIONS: string[] = DEPLOY_ORDER.slice(0, -1).map(
  (s, i) => transitionKey(s, DEPLOY_ORDER[i + 1]),
);

/** Does a status_changed transition pass a hook's transitions filter?
 *  Empty filter → always true. A non-empty filter requires a concrete
 *  from/to whose "FROM>TO" key is listed. */
export function transitionMatches(
  filter: string[],
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (filter.length === 0) return true;
  if (!from || !to) return false;
  return filter.includes(transitionKey(from, to));
}
