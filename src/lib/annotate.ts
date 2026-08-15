import { AnnotationTargetError } from "@/lib/events";

/** Run an annotation creator, mapping its outcomes to HTTP responses.
 *  `creator` returns the created row, or null when the target event id is unknown. */
export async function runAnnotation<T>(
  creator: () => Promise<T | null>,
): Promise<Response> {
  try {
    const created = await creator();
    if (created === null) return Response.json({ error: "event not found" }, { status: 404 });
    return Response.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof AnnotationTargetError) {
      return Response.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}
