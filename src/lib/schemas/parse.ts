import { z } from "zod";

/** One line per issue: "a.b: message", root issues bare. Stable, greppable, single string. */
export function zodErrorMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

type Parsed<S extends z.ZodTypeAny> = { ok: true; value: z.output<S> } | { ok: false; res: Response };

/** Read + validate a JSON body; the 400s carry the shared { error } shape. */
export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<Parsed<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: Response.json({ error: "body must be valid JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 }) };
  }
  return { ok: true, value: parsed.data };
}
