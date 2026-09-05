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
  it("renders root-level issues without path prefix", () => {
    const r = z.object({ x: z.string() }).safeParse(null);
    expect(r.success).toBe(false);
    const msg = zodErrorMessage((r as { error: z.ZodError }).error);
    // Root-level issue should have no leading colon or path prefix
    expect(msg).not.toMatch(/^:|^ :/);
    expect(msg).toBe("Invalid input: expected object, received null");
  });
});

describe("parseBody", () => {
  it("returns the typed value on success", async () => {
    const r = await parseBody(req(JSON.stringify({ name: "ok" })), schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("ok");
  });
  it("returns the typed value with nested properties", async () => {
    const r = await parseBody(req(JSON.stringify({ name: "ok", nested: { n: 42 } })), schema);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("ok");
      expect(r.value.nested?.n).toBe(42);
    }
  });
  it("400s on invalid JSON", async () => {
    const r = await parseBody(req("{nope"), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.res.status).toBe(400);
      expect((await r.res.json()).error).toBe("body must be valid JSON");
    }
  });
  it("400s on absent body", async () => {
    const r = await parseBody(new Request("http://x/api", { method: "POST" }), schema);
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
  it("400s on non-object input with root-level error message", async () => {
    const r = await parseBody(req(JSON.stringify(null)), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.res.status).toBe(400);
      const error = (await r.res.json()).error;
      // Root-level issue should not have leading colon or path prefix
      expect(error).not.toMatch(/^:|^ :/);
      expect(error).toBe("Invalid input: expected object, received null");
    }
  });
});
