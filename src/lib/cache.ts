import { revalidateTag } from "next/cache";
import { log } from "@/lib/log";

/** Cache tag carrying the sidebar tree. Registered by `getSidebarTreeCached`. */
export const SIDEBAR_TREE_TAG = "sidebar-tree";

/**
 * How long a cached sidebar tree may be served without being re-read.
 *
 * The window only ever hides stale *counters*: the structure (which companies,
 * products and services exist, and their order) is invalidated on the spot by
 * every hierarchy write. 30s is the same order of magnitude as the 15s
 * auto-refresh the timeline already runs on.
 */
export const SIDEBAR_TREE_TTL_SECONDS = 30;

/**
 * Drop the cached sidebar tree, both scopes at once.
 *
 * Called from the domain layer (hierarchy writes, public-visibility changes) so no
 * route or action can forget it. That places it on code paths that also run
 * OUTSIDE a Next request — vitest, the auto-lot sweeper, the seed scripts — where
 * `revalidateTag` throws for want of a store. A failed cache drop must never fail
 * the write that succeeded, so the throw is logged and swallowed: the entry then
 * expires on its own within SIDEBAR_TREE_TTL_SECONDS.
 */
export async function invalidateSidebarTree(): Promise<void> {
  try {
    revalidateTag(SIDEBAR_TREE_TAG);
  } catch (e) {
    log.debug("sidebar tree cache not invalidated (no request context)", { mod: "cache", err: String(e) });
  }
}

/**
 * Wraps a write that changes the shape of the sidebar tree (what exists, where it
 * sits, its order, whether it is public) so the cached tree is dropped as soon as
 * the write lands. Invalidating in the domain layer rather than in the routes and
 * actions means a new call site cannot forget it.
 */
export async function afterTreeChange<T>(write: Promise<T>): Promise<T> {
  const result = await write;
  await invalidateSidebarTree();
  return result;
}
