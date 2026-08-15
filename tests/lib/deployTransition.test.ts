import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { DeployStatus } from "@prisma/client";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import {
  createEvent,
  transitionDeployStatus,
  undoDeployStatus,
  DeployTransitionError,
  rollbackToPreviousVersion,
} from "@/lib/events";

async function seedDeployment(
  status: DeployStatus | null = DeployStatus.PENDING,
) {
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
  return { serviceId: s.id, ev };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("transitionDeployStatus", () => {
  it("records history and advances the status on a legal move", async () => {
    const { ev } = await seedDeployment(DeployStatus.PENDING);
    const updated = await transitionDeployStatus(ev.id, {
      to: DeployStatus.IN_PROGRESS,
      actorName: "Alice",
      actorEmail: "a@x.io",
      comment: null,
    });
    expect(updated?.deployStatus).toBe(DeployStatus.IN_PROGRESS);
    // seedDeployment(PENDING) itself now auto-records a null -> PENDING transition
    // (see createEvent), so the transition under test is the second row.
    const hist = await prisma.statusTransition.findMany({
      where: { eventId: ev.id },
      orderBy: { createdAt: "asc" },
    });
    expect(hist).toHaveLength(2);
    expect(hist[1].fromStatus).toBe(DeployStatus.PENDING);
    expect(hist[1].toStatus).toBe(DeployStatus.IN_PROGRESS);
    expect(hist[1].actorName).toBe("Alice");
    expect(hist[1].actorEmail).toBe("a@x.io");
  });

  it("rejects an illegal (skipping) move and persists nothing", async () => {
    const { ev } = await seedDeployment(DeployStatus.PENDING);
    await expect(
      transitionDeployStatus(ev.id, {
        to: DeployStatus.DEPLOYED,
        actorName: "Alice",
        actorEmail: null,
        comment: null,
      }),
    ).rejects.toBeInstanceOf(DeployTransitionError);
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.deployStatus).toBe(DeployStatus.PENDING);
    // 1, not 0: seedDeployment(PENDING) auto-records the initial null -> PENDING
    // transition on creation; the rejected move itself persists nothing more.
    expect(await prisma.statusTransition.count()).toBe(1);
  });

  it("rejects a backward move", async () => {
    const { ev } = await seedDeployment(DeployStatus.TESTING);
    await expect(
      transitionDeployStatus(ev.id, {
        to: DeployStatus.DEPLOYED,
        actorName: "Al",
        actorEmail: null,
        comment: null,
      }),
    ).rejects.toBeInstanceOf(DeployTransitionError);
  });

  it("allows PENDING as the only first move when status is null", async () => {
    const { ev } = await seedDeployment(null);
    const updated = await transitionDeployStatus(ev.id, {
      to: DeployStatus.PENDING,
      actorName: "Al",
      actorEmail: null,
      comment: null,
    });
    expect(updated?.deployStatus).toBe(DeployStatus.PENDING);
    await expect(
      transitionDeployStatus((await seedDeployment(null)).ev.id, {
        to: DeployStatus.IN_PROGRESS,
        actorName: "Al",
        actorEmail: null,
        comment: null,
      }),
    ).rejects.toBeInstanceOf(DeployTransitionError);
  });

  it("returns null for a non-deployment event", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({
      productId: p.id,
      name: "API",
      type: "API",
    });
    const inc = await createEvent({
      serviceId: s.id,
      environment: "PROD",
      type: "INCIDENT",
      occurredAt: new Date(),
      fields: {
        incidentType: "outage",
        incidentStatus: "INVESTIGATING",
        startedAt: new Date(),
        resolvedAt: null,
        comment: null,
      },
    });
    const res = await transitionDeployStatus(inc.id, {
      to: DeployStatus.PENDING,
      actorName: "Al",
      actorEmail: null,
      comment: null,
    });
    expect(res).toBeNull();
  });

  it("rejects a transition out of the terminal VALIDATE state", async () => {
    const { ev } = await seedDeployment(DeployStatus.VALIDATE);
    await expect(
      transitionDeployStatus(ev.id, {
        to: DeployStatus.PENDING,
        actorName: "Al",
        actorEmail: null,
        comment: null,
      }),
    ).rejects.toBeInstanceOf(DeployTransitionError);
    // 1, not 0: seedDeployment(VALIDATE) auto-records the initial null -> VALIDATE
    // transition on creation; the rejected move itself persists nothing more.
    expect(await prisma.statusTransition.count()).toBe(1);
  });

  it("persists the provided comment on the history row", async () => {
    const { ev } = await seedDeployment(DeployStatus.TESTING);
    await transitionDeployStatus(ev.id, {
      to: DeployStatus.VALIDATE,
      actorName: "Al",
      actorEmail: null,
      comment: "signed off",
    });
    // seedDeployment also auto-records an initial null -> TESTING transition (no
    // comment), so target the row under test explicitly rather than the first one.
    const hist = await prisma.statusTransition.findFirst({
      where: { eventId: ev.id, toStatus: DeployStatus.VALIDATE },
    });
    expect(hist?.comment).toBe("signed off");
  });

  it("returns null for a non-existent event id", async () => {
    const res = await transitionDeployStatus("nonexistent-id", {
      to: DeployStatus.PENDING,
      actorName: "Al",
      actorEmail: null,
      comment: null,
    });
    expect(res).toBeNull();
  });
});

describe("rollbackToPreviousVersion actor", () => {
  it("records the actor and the version it rolls back to", async () => {
    const { serviceId } = await seedDeployment(DeployStatus.DEPLOYED);
    await createEvent({
      serviceId,
      environment: "PROD",
      type: "DEPLOYMENT",
      occurredAt: new Date(Date.now() + 1000),
      fields: {
        version: "2.0.0",
        requester: "ci",
        changeType: "NORMAL",
        deployStatus: DeployStatus.DEPLOYED,
      },
    });
    const latest = await prisma.event.findFirst({
      where: { version: "2.0.0" },
    });
    const rb = await rollbackToPreviousVersion(latest!.id, "Alice");
    // Actor and target version are columns now; the sentence is composed (and
    // translated) at render time, so no comment is stored without user text.
    expect(rb?.actorName).toBe("Alice");
    expect(rb?.previousVersion).toBe("1.0.0");
    expect(rb?.comment).toBeNull();
  });

  it("leaves previousVersion null when nothing was deployed before", async () => {
    const { ev } = await seedDeployment(DeployStatus.DEPLOYED);
    const rb = await rollbackToPreviousVersion(ev.id, "Alice");
    expect(rb?.previousVersion).toBeNull();
    expect(rb?.comment).toBeNull();
  });

  it("uses an explicit comment when provided, keeping the actor", async () => {
    const { serviceId } = await seedDeployment(DeployStatus.DEPLOYED);
    await createEvent({
      serviceId,
      environment: "PROD",
      type: "DEPLOYMENT",
      occurredAt: new Date(Date.now() + 1000),
      fields: {
        version: "2.0.0",
        requester: "ci",
        changeType: "NORMAL",
        deployStatus: DeployStatus.DEPLOYED,
      },
    });
    const latest = await prisma.event.findFirst({
      where: { version: "2.0.0" },
    });
    const rb = await rollbackToPreviousVersion(
      latest!.id,
      "Alice",
      "bad release",
    );
    expect(rb?.comment).toBe("bad release");
    expect(rb?.actorName).toBe("Alice");
    expect(rb?.previousVersion).toBe("1.0.0");
  });
});

describe("undoDeployStatus", () => {
  it("steps the status back and records a backward transition", async () => {
    const { ev } = await seedDeployment(DeployStatus.TESTING);
    const updated = await undoDeployStatus(ev.id, {
      actorName: "Al",
      actorEmail: null,
      comment: "erreur de saisie",
    });
    expect(updated?.deployStatus).toBe(DeployStatus.DEPLOYED);
    const hist = await prisma.statusTransition.findMany({
      where: { eventId: ev.id },
      orderBy: { createdAt: "desc" },
    });
    expect(hist[0].fromStatus).toBe(DeployStatus.TESTING);
    expect(hist[0].toStatus).toBe(DeployStatus.DEPLOYED);
    expect(hist[0].comment).toBe("erreur de saisie");
    expect(hist[0].actorName).toBe("Al");
  });

  it("is repeatable down the chain", async () => {
    const { ev } = await seedDeployment(DeployStatus.DEPLOYED);
    await undoDeployStatus(ev.id, {
      actorName: "Al",
      actorEmail: null,
      comment: "x",
    });
    const again = await undoDeployStatus(ev.id, {
      actorName: "Al",
      actorEmail: null,
      comment: "y",
    });
    expect(again?.deployStatus).toBe(DeployStatus.PENDING);
  });

  it("rejects undo at SCHEDULED (no predecessor), persisting nothing", async () => {
    const { ev } = await seedDeployment(DeployStatus.SCHEDULED);
    await expect(
      undoDeployStatus(ev.id, {
        actorName: "Al",
        actorEmail: null,
        comment: "x",
      }),
    ).rejects.toBeInstanceOf(DeployTransitionError);
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.deployStatus).toBe(DeployStatus.SCHEDULED);
    expect(
      await prisma.statusTransition.count({
        where: { eventId: ev.id, fromStatus: DeployStatus.SCHEDULED },
      }),
    ).toBe(0);
  });

  it("returns null for a non-deployment", async () => {
    const c = await createCompany({ name: "Z" });
    const p = await createProduct({ companyId: c.id, name: "P" });
    const s = await createService({ productId: p.id, name: "S", type: "API" });
    const inc = await createEvent({
      serviceId: s.id,
      environment: "PROD",
      type: "INCIDENT",
      occurredAt: new Date(),
      tags: [],
      fields: {
        incidentType: "x",
        incidentStatus: "INVESTIGATING",
        startedAt: new Date(),
        resolvedAt: null,
        comment: null,
      },
    });
    expect(
      await undoDeployStatus(inc.id, {
        actorName: "Al",
        actorEmail: null,
        comment: "x",
      }),
    ).toBeNull();
  });
});
