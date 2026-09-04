import { describe, it, expect, vi, afterEach } from "vitest";
import { teamsConnector } from "@/lib/hooks/connectors/teams";
import type { HookEvent } from "@/lib/hooks/types";

const event: HookEvent = {
  kind: "deploy.status_changed", occurredAt: "2026-07-01T00:00:00.000Z",
  company: "acme", product: "checkout", service: "api", environment: "PROD",
  actor: "alice", data: { version: "1.2.3", deployStatus: "DEPLOYED", comment: "ok" },
};

afterEach(() => vi.restoreAllMocks());

describe("teamsConnector", () => {
  it("POSTs an Adaptive Card mentioning product/service and version, 2xx → ok", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const res = await teamsConnector.send(event, { url: "https://teams/hook" });
    expect(res).toEqual({ ok: true, statusCode: 200 });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.type).toBe("message");
    const blocks = body.attachments[0].content.body as { text: string }[];
    expect(blocks[0].text).toContain("checkout");
    expect(blocks[0].text).toContain("api");
    expect(blocks[1].text).toContain("1.2.3");
  });
  it("renders the target's locale when configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await teamsConnector.send(event, { url: "https://teams/hook", locale: "en" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.attachments[0].content.body[1].text).toContain("by alice");
  });
  it("non-2xx → not ok with status code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    expect(await teamsConnector.send(event, { url: "https://teams/hook" })).toEqual({ ok: false, statusCode: 503 });
  });
  it("thrown request → error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    const res = await teamsConnector.send(event, { url: "https://teams/hook" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("down");
  });
  it("missing url → error", async () => {
    expect((await teamsConnector.send(event, {})).ok).toBe(false);
  });
});
