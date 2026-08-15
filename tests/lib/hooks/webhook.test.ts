import { describe, it, expect, vi, afterEach } from "vitest";
import { webhookConnector } from "@/lib/hooks/connectors/webhook";
import type { HookEvent } from "@/lib/hooks/types";

const event: HookEvent = {
  kind: "deploy.created", occurredAt: "2026-07-01T00:00:00.000Z",
  company: "acme", product: "checkout", service: "api", environment: "PROD", data: {},
};

afterEach(() => vi.restoreAllMocks());

describe("webhookConnector", () => {
  it("POSTs the event JSON and reports 2xx as ok", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const res = await webhookConnector.send(event, { url: "https://hook.example/x", headers: { "x-secret": "s" } });
    expect(res).toEqual({ ok: true, statusCode: 204 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hook.example/x");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string).kind).toBe("deploy.created");
    expect((init as any).headers["x-secret"]).toBe("s");
  });
  it("reports non-2xx as not ok with the status code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    expect(await webhookConnector.send(event, { url: "https://hook.example/x" })).toEqual({ ok: false, statusCode: 500 });
  });
  it("reports a thrown/timed-out request as an error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    const res = await webhookConnector.send(event, { url: "https://hook.example/x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("boom");
  });
  it("errors when url is missing", async () => {
    const res = await webhookConnector.send(event, {});
    expect(res.ok).toBe(false);
  });
  it("refuses to call the cloud metadata endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await webhookConnector.send(event, { url: "http://169.254.169.254/latest/meta-data/" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/link-local/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses a non-http scheme", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await webhookConnector.send(event, { url: "file:///etc/passwd" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not follow redirects, which would sidestep the url check", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await webhookConnector.send(event, { url: "https://hook.example/x" });
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe("manual");
  });
});
