import { LogsClient } from "./LogsClient";

export const dynamic = "force-dynamic";

/**
 * Read at request time, not baked into the bundle: the mailbox is part of the
 * environment an instance runs in, not of the build. Unset — as on every
 * deployed instance — and the link simply does not appear.
 */
export default function LogsPage() {
  return <LogsClient mailpitUrl={process.env.RC_MAILPIT_URL ?? null} />;
}
