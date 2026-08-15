import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { DeployStatus } from "@prisma/client";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let mockSession: { sub: string; name: string; email?: string; roles: string[] } | null = null;
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => mockSession,
  hasRole: (u: { roles: string[] } | null, r: string) => !!u && u.roles.includes(r),
}));

import { transitionDeployStatusAction, undoDeployStatusAction } from "@/app/actions/events";

async function seedDeployment(status: DeployStatus = DeployStatus.DEPLOYED) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({
    productId: p.id,
    name: "Payment API",
    type: "API",
  });
  const ev = await createEvent({
    serviceId: s.id,
    environment: "PROD",
    type: "DEPLOYMENT",
    occurredAt: new Date(),
    fields: {
      version: "1.0.0",
      requester: "ci",
      changeType: "NORMAL",
      deployStatus: status,
    },
  });
  return ev;
}

beforeEach(async () => {
  await resetDb();
  mockSession = null;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("transitionDeployStatusAction", () => {
  it("requires a logged-in session", async () => {
    mockSession = null;
    const ev = await seedDeployment(DeployStatus.DEPLOYED);
    const res = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "TESTING",
      actorName: "Alice",
      path: "/",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("err.loginRequired");
  });

  it("advances a legal transition as devops and records the session actor", async () => {
    mockSession = { sub: "d", name: "Dev", roles: ["devops"] };
    const ev = await seedDeployment(DeployStatus.PENDING);

    const toInProgress = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "IN_PROGRESS",
      actorName: "someone-else",
      path: "/",
    });
    expect(toInProgress).toEqual({ ok: true });

    const toDeployed = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "DEPLOYED",
      actorName: "someone-else",
      path: "/",
    });
    expect(toDeployed).toEqual({ ok: true });

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.deployStatus).toBe(DeployStatus.DEPLOYED);

    // Excludes the initial creation transition (actorName = requester "ci"); only the
    // two transitions made through the action must carry the session actor.
    const transitions = await prisma.statusTransition.findMany({
      where: { eventId: ev.id, fromStatus: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    expect(transitions).toHaveLength(2);
    for (const t of transitions) {
      expect(t.actorName).toBe("Dev");
    }
  });

  it("rejects a devops session advancing to a qa-owned status (VALIDATE)", async () => {
    mockSession = { sub: "d", name: "Dev", roles: ["devops"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    const res = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "VALIDATE",
      actorName: "Dev",
      comment: "signed off",
      path: "/",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res).toMatchObject({ error: "err.roleRequired", vars: { role: "qa" } });
  });

  it("allows a qa session to advance to VALIDATE", async () => {
    mockSession = { sub: "q", name: "Quinn", roles: ["qa"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    const res = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "VALIDATE",
      actorName: "someone-else",
      comment: "signed off",
      path: "/",
    });
    expect(res).toEqual({ ok: true });
    const transitions = await prisma.statusTransition.findMany({ where: { eventId: ev.id, fromStatus: { not: null } } });
    expect(transitions[0]?.actorName).toBe("Quinn");
  });

  it("allows an admin session to advance to VALIDATE", async () => {
    mockSession = { sub: "a", name: "Admin", roles: ["admin"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    const res = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "VALIDATE",
      actorName: "someone-else",
      comment: "signed off",
      path: "/",
    });
    expect(res).toEqual({ ok: true });
  });

  it("requires a comment for VALIDATE", async () => {
    mockSession = { sub: "q", name: "Quinn", roles: ["qa"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    const noComment = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "VALIDATE",
      actorName: "Al",
      path: "/",
    });
    expect(noComment.ok).toBe(false);
    const withComment = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "VALIDATE",
      actorName: "Al",
      comment: "signed off",
      path: "/",
    });
    expect(withComment).toEqual({ ok: true });
  });

  it("rejects an illegal transition", async () => {
    mockSession = { sub: "d", name: "Dev", roles: ["devops"] };
    const ev = await seedDeployment(DeployStatus.PENDING);
    const res = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "VALIDATE",
      actorName: "Al",
      comment: "x",
      path: "/",
    });
    expect(res.ok).toBe(false);
  });

  it("rejects an invalid status value", async () => {
    mockSession = { sub: "d", name: "Dev", roles: ["devops"] };
    const ev = await seedDeployment(DeployStatus.PENDING);
    const res = await transitionDeployStatusAction({
      eventId: ev.id,
      to: "NONSENSE",
      actorName: "Al",
      path: "/",
    });
    expect(res.ok).toBe(false);
  });
});

describe("undoDeployStatusAction", () => {
  it("requires a logged-in session", async () => {
    mockSession = null;
    const ev = await seedDeployment(DeployStatus.TESTING);
    const res = await undoDeployStatusAction({ eventId: ev.id, actorName: "Al", comment: "erreur", path: "/" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("err.loginRequired");
  });

  it("reverts one step on success as devops, recording the session actor", async () => {
    mockSession = { sub: "d", name: "Dev", roles: ["devops"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    const res = await undoDeployStatusAction({ eventId: ev.id, actorName: "someone-else", comment: "erreur", path: "/" });
    expect(res).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.deployStatus).toBe(DeployStatus.DEPLOYED);
    const transitions = await prisma.statusTransition.findMany({ where: { eventId: ev.id, fromStatus: { not: null } } });
    expect(transitions[0]?.actorName).toBe("Dev");
  });

  it("rejects a qa session (requires devops or admin)", async () => {
    mockSession = { sub: "q", name: "Quinn", roles: ["qa"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    const res = await undoDeployStatusAction({ eventId: ev.id, actorName: "Al", comment: "erreur", path: "/" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res).toMatchObject({ error: "err.roleRequired", vars: { role: "devops" } });
  });

  it("allows an admin session", async () => {
    mockSession = { sub: "a", name: "Admin", roles: ["admin"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    const res = await undoDeployStatusAction({ eventId: ev.id, actorName: "Al", comment: "erreur", path: "/" });
    expect(res).toEqual({ ok: true });
  });

  it("requires a comment", async () => {
    mockSession = { sub: "d", name: "Dev", roles: ["devops"] };
    const ev = await seedDeployment(DeployStatus.TESTING);
    expect((await undoDeployStatusAction({ eventId: ev.id, actorName: "Al", comment: "  ", path: "/" })).ok).toBe(false);
  });
  it("rejects when there is no predecessor", async () => {
    mockSession = { sub: "d", name: "Dev", roles: ["devops"] };
    const ev = await seedDeployment(DeployStatus.SCHEDULED);
    expect((await undoDeployStatusAction({ eventId: ev.id, actorName: "Al", comment: "x", path: "/" })).ok).toBe(false);
  });
});
