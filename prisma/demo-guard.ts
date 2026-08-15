/**
 * Both demo jobs wipe or mutate whatever database they are pointed at, so they
 * refuse to run unless the deployment says it is a demo *and* the database name
 * looks like one. A mistyped DATABASE_URL should never be able to clear production.
 */
export function assertDemoTarget(): void {
  if (process.env.RC_DEMO_MODE !== "true") {
    throw new Error("Refusing to run: RC_DEMO_MODE is not \"true\". This job rewrites the database.");
  }
  const url = process.env.DATABASE_URL ?? "";
  const dbName = url.split("/").pop()?.split("?")[0] ?? "";
  if (!/demo/i.test(dbName)) {
    throw new Error(
      `Refusing to run: database "${dbName}" does not look like a demo database ` +
        "(its name must contain \"demo\"). Set DATABASE_URL to the demo instance.",
    );
  }
}
