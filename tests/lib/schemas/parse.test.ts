import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseBody, zodErrorMessage } from "@/lib/schemas/parse";

const schema = z.object({ name: z.string().min(1), nested: z.object({ n: z.number() }).optional() });
const req = (body: string) =>
  new Request("http://x/api", { method: "POST", body, headers: { "content-type": "application/json" } });

describe("zodErrorMessage", () => {
  it("joins issues with dot paths", () => {
    const r = z.object({ a: z.string(), b: z.object({ c: z.number() }) }).safeParse({ b: { c: "x" } });
    expect(r.success).toBe(false);
    const msg = zodErrorMessage((r as { error: z.ZodError }).error);
    expect(msg).toContain("a:");
    expect(msg).toContain("b.c:");
    expect(msg).toContain("; ");
  });
});

describe("parseBody", () => {
  it("returns the typed value on success", async () => {
    const r = await parseBody(req(JSON.stringify({ name: "ok" })), schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("ok");
  });
  it("400s on invalid JSON", async () => {
    const r = await parseBody(req("{nope"), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.res.status).toBe(400);
      expect((await r.res.json()).error).toBe("body must be valid JSON");
    }
  });
  it("400s with the flattened message on schema failure", async () => {
    const r = await parseBody(req(JSON.stringify({})), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.res.status).toBe(400);
      expect((await r.res.json()).error).toContain("name:");
    }
  });
});
