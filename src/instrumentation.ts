/** Next.js instrumentation hook: runs once per server start. The import MUST sit
 *  inside the statically-analyzable `if` block — Next inlines NEXT_RUNTIME at build
 *  time, so the edge compile sees `if (false)` and prunes the whole chain (sweep →
 *  dispatch → connectors → nodemailer) before module resolution. An early-return
 *  form leaves the import live in the edge bundle, where node builtins don't
 *  resolve and the build fails. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startHookSweeper } = await import("@/lib/hooks/sweep");
    startHookSweeper();
  }
}
