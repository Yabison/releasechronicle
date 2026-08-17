/** Next.js instrumentation hook: runs once per server start. The dynamic
 *  import keeps Prisma out of the edge runtime bundle. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startHookSweeper } = await import("@/lib/hooks/sweep");
  startHookSweeper();
}
