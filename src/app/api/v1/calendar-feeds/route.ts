import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { listCalendarFeeds, createCalendarFeed } from "@/lib/calendarFeeds";
import { nonEmpty, optionalOrNull } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const VALID_TYPES = ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"];

// A non-string scope value is silently dropped to null (old `typeof === "string"` gate) rather
// than 400ing, so the bare string is preprocessed away before it reaches optionalOrNull().
const scopeField = () => z.preprocess((v) => (typeof v === "string" ? v : null), optionalOrNull());

const postSchema = z.object({
  name: nonEmpty(),
  // Invalid entries are silently dropped, never rejected, as today.
  types: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((t) => typeof t === "string" && VALID_TYPES.includes(t)) : []),
    z.array(z.string()),
  ),
  company: scopeField(),
  product: scopeField(),
  service: scopeField(),
  environment: scopeField(),
});

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await listCalendarFeeds());
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  const feed = await createCalendarFeed({
    name: parsed.value.name,
    company: parsed.value.company,
    product: parsed.value.product,
    service: parsed.value.service,
    environment: parsed.value.environment,
    types: parsed.value.types,
  });
  return Response.json(feed, { status: 201 });
}
