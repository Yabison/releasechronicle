import { describe, it, expect } from "vitest";
import { buildServiceTimeline, groupByMonth } from "@/lib/eventTimeline";
import type { ClientEvent } from "@/lib/timeline";

function base(over: Partial<ClientEvent>): ClientEvent {
  return {
    id: "e", serviceId: "s", environment: "PROD", type: "DEPLOYMENT",
    occurredAt: "2026-06-20T14:10:00.000Z", version: null, requester: null,
    changeType: null, externalLink: null, deployStatus: null, incidentType: null, incidentStatus: null,
    startedAt: null, resolvedAt: null, comment: null, windowStart: null, windowEnd: null,
    tags: [], causedById: null, parentId: null, hourType: null, derived: {}, lot: null, rollbacks: [], qaValidations: [], observations: [], statusTransitions: [], comments: [],
    ...over,
  };
}

describe("buildServiceTimeline", () => {
  it("splits deploy vs hotfix by changeType", () => {
    const { history, counters } = buildServiceTimeline([
      base({ id: "d1", changeType: "NORMAL", comment: "cache Redis" }),
      base({ id: "h1", changeType: "HOTFIX", comment: "fix leak" }),
    ]);
    expect(history.find((e) => e.eventId === "d1")!.category).toBe("DEPLOY");
    expect(history.find((e) => e.eventId === "h1")!.category).toBe("HOTFIX");
    expect(counters).toEqual({ deploy: 1, hotfix: 1, incident: 0, maintenance: 0 });
  });

  it("marks a rolled-back deployment without adding a separate entry", () => {
    const { history } = buildServiceTimeline([
      base({
        id: "d1", version: "2.4.1", occurredAt: "2026-06-20T14:10:00.000Z",
        rollbacks: [{ id: "r1", comment: "Retour v2.4.0", previousVersion: null, actorName: null, link: null, createdAt: "2026-06-20T14:54:00.000Z" }],
      }),
    ]);
    // No separate ROLLBACK entry — just the deployment, flagged rolledBack.
    expect(history).toHaveLength(1);
    expect(history[0].eventId).toBe("d1");
    expect(history[0].category).toBe("DEPLOY");
    expect(history[0].rolledBack).toBe(true);
  });

  it("warns a MEP (≤ PENDING) with a PRE MEP not yet VALIDATE", () => {
    const parent = base({ id: "m1", changeType: "NORMAL", deployStatus: "PENDING" });
    const preOpen = base({ id: "pre1", changeType: "PRE_MEP", deployStatus: "IN_PROGRESS", parentId: "m1" });
    const warn = buildServiceTimeline([parent, preOpen]).history.find((e) => e.eventId === "m1");
    expect(warn?.warnPre).toBe(true);
    // PRE validated → no warning.
    const preOk = base({ id: "pre1", changeType: "PRE_MEP", deployStatus: "VALIDATE", parentId: "m1" });
    expect(buildServiceTimeline([parent, preOk]).history.find((e) => e.eventId === "m1")?.warnPre).toBe(false);
    // MEP already past PENDING → no warning.
    const advanced = base({ id: "m1", changeType: "NORMAL", deployStatus: "DEPLOYED" });
    expect(buildServiceTimeline([advanced, preOpen]).history.find((e) => e.eventId === "m1")?.warnPre).toBe(false);
  });

  it("pins an upcoming/ongoing maintenance to the bucket, not history", () => {
    const now = new Date("2026-06-20T12:00:00.000Z");
    const { history, maintenances } = buildServiceTimeline(
      [
        base({
          id: "m1", type: "MAINTENANCE", comment: "index rebuild",
          occurredAt: "2026-06-21T10:00:00.000Z",
          windowStart: "2026-06-21T10:00:00.000Z", windowEnd: "2026-06-21T12:00:00.000Z",
        }),
      ],
      now,
    );
    expect(history).toHaveLength(0);
    expect(maintenances[0].category).toBe("MAINTENANCE");
  });

  it("drops a past maintenance into the history timeline", () => {
    const now = new Date("2026-06-20T12:00:00.000Z");
    const { history, maintenances, counters } = buildServiceTimeline(
      [
        base({
          id: "m1", type: "MAINTENANCE", comment: "done",
          occurredAt: "2026-06-18T10:00:00.000Z",
          windowStart: "2026-06-18T10:00:00.000Z", windowEnd: "2026-06-18T12:00:00.000Z",
        }),
      ],
      now,
    );
    expect(maintenances).toHaveLength(0);
    expect(history[0].category).toBe("MAINTENANCE");
    expect(counters.maintenance).toBe(1);
  });

  it("counts incidents and titles them by comment then incidentType", () => {
    const { history, counters } = buildServiceTimeline([
      base({ id: "i1", type: "INCIDENT", incidentType: "latency", comment: "Latence élevée" }),
      base({ id: "i2", type: "INCIDENT", incidentType: "latency", comment: null }),
    ]);
    expect(counters.incident).toBe(2);
    expect(history.find((e) => e.eventId === "i1")!.title).toBe("Latence élevée");
    expect(history.find((e) => e.eventId === "i2")!.title).toBe("latency");
  });

  it("sorts history by time descending", () => {
    const { history } = buildServiceTimeline([
      base({ id: "old", occurredAt: "2026-06-15T11:00:00.000Z" }),
      base({ id: "new", occurredAt: "2026-06-20T14:10:00.000Z" }),
    ]);
    expect(history.map((e) => e.eventId)).toEqual(["new", "old"]);
  });
});

describe("groupByMonth", () => {
  it("groups entries under an uppercase French month label, newest first", () => {
    const groups = groupByMonth([
      { id: "a", eventId: "a", category: "DEPLOY", environment: "PROD", at: "2026-06-20T14:10:00.000Z", version: null, title: "", done: false, endAt: null },
      { id: "b", eventId: "b", category: "DEPLOY", environment: "PROD", at: "2026-05-02T09:00:00.000Z", version: null, title: "", done: false, endAt: null },
    ], { mode: "utc", locale: "fr" });
    expect(groups[0].key).toBe("2026-06");
    expect(groups[0].label).toBe("JUIN 2026");
    expect(groups[1].key).toBe("2026-05");
    expect(groups[0].entries).toHaveLength(1);
  });
  it("puts a midnight-boundary event under the month its displayed stamp shows", () => {
    // 22:30 UTC on May 31st = 00:30 on June 1st in Paris.
    const groups = groupByMonth([
      { id: "a", eventId: "a", category: "DEPLOY", environment: "PROD", at: "2026-05-31T22:30:00.000Z", version: null, title: "", done: false, endAt: null },
    ], { mode: "local", timeZone: "Europe/Paris", locale: "fr" });
    expect(groups[0].key).toBe("2026-06");
    expect(groups[0].label).toBe("JUIN 2026");
  });
});

function deployEvent(deployStatus: string | null): ClientEvent {
  return {
    id: "d1", serviceId: "s1", environment: "PROD", type: "DEPLOYMENT",
    occurredAt: "2026-07-01T00:00:00.000Z", version: "1.0.0", requester: "ci",
    changeType: "NORMAL", externalLink: null, deployStatus,
    incidentType: null, incidentStatus: null, startedAt: null, resolvedAt: null,
    comment: null, windowStart: null, windowEnd: null, tags: [], causedById: null, parentId: null, hourType: null,
    derived: {}, lot: null, rollbacks: [], qaValidations: [], observations: [], statusTransitions: [], comments: [],
  };
}

describe("buildServiceTimeline deployStatus", () => {
  it("carries deployStatus onto the deploy entry", () => {
    const { history } = buildServiceTimeline([deployEvent("DEPLOYED")]);
    const entry = history.find((e) => e.eventId === "d1");
    expect(entry?.deployStatus).toBe("DEPLOYED");
  });
});

describe("buildServiceTimeline deployment duration", () => {
  const H = 3600_000;
  it("measures IN_PROGRESS → first live transition", () => {
    const e = deployEvent("VALIDATE");
    e.statusTransitions = [
      { id: "t1", fromStatus: null, toStatus: "IN_PROGRESS", actorName: "a", actorEmail: null, comment: null, createdAt: "2026-07-01T10:00:00.000Z" },
      { id: "t2", fromStatus: "IN_PROGRESS", toStatus: "DEPLOYED", actorName: "a", actorEmail: null, comment: null, createdAt: "2026-07-01T12:00:00.000Z" },
      { id: "t3", fromStatus: "DEPLOYED", toStatus: "VALIDATE", actorName: "a", actorEmail: null, comment: null, createdAt: "2026-07-02T00:00:00.000Z" },
    ];
    const { history } = buildServiceTimeline([e]);
    expect(history.find((x) => x.eventId === "d1")?.durationMs).toBe(2 * H);
  });
  it("falls back to occurredAt as the start when there is no IN_PROGRESS transition", () => {
    const e = deployEvent("VALIDATE"); // occurredAt 2026-07-01T00:00:00Z
    e.statusTransitions = [
      { id: "t1", fromStatus: null, toStatus: "VALIDATE", actorName: "a", actorEmail: null, comment: null, createdAt: "2026-07-01T03:00:00.000Z" },
    ];
    const { history } = buildServiceTimeline([e]);
    expect(history.find((x) => x.eventId === "d1")?.durationMs).toBe(3 * H);
  });
  it("shows a (zero) duration for a deployment at DEPLOYED+ with no tracked transitions", () => {
    const e = deployEvent("DEPLOYED"); // occurredAt set, statusTransitions [] by default
    const { history } = buildServiceTimeline([e]);
    expect(history.find((x) => x.eventId === "d1")?.durationMs).toBe(0);
  });
  it("shows no duration for a deployment still before DEPLOYED", () => {
    const e = deployEvent("IN_PROGRESS");
    const { history } = buildServiceTimeline([e]);
    expect(history.find((x) => x.eventId === "d1")?.durationMs ?? null).toBeNull();
  });
  it("ends the duration at the rollback time when rolled back", () => {
    const e = deployEvent("DEPLOYED");
    e.statusTransitions = [
      { id: "t1", fromStatus: null, toStatus: "IN_PROGRESS", actorName: "a", actorEmail: null, comment: null, createdAt: "2026-07-01T10:00:00.000Z" },
      { id: "t2", fromStatus: "IN_PROGRESS", toStatus: "DEPLOYED", actorName: "a", actorEmail: null, comment: null, createdAt: "2026-07-01T11:00:00.000Z" },
    ];
    e.rollbacks = [{ id: "r1", comment: "revert", previousVersion: null, actorName: null, link: null, createdAt: "2026-07-01T15:00:00.000Z" }];
    const { history } = buildServiceTimeline([e]);
    // start = IN_PROGRESS 10:00, end = rollback 15:00 → 5h (not the DEPLOYED time)
    expect(history.find((x) => x.eventId === "d1")?.durationMs).toBe(5 * H);
  });
});

describe("buildServiceTimeline lot", () => {
  it("carries lot onto the deploy entry", () => {
    const ev = deployEvent("DEPLOYED");
    ev.lot = "rel-1";
    const { history } = buildServiceTimeline([ev]);
    expect(history.find((e) => e.eventId === "d1")?.lot).toBe("rel-1");
  });
});

describe("buildServiceTimeline environment", () => {
  it("carries the environment on each entry", () => {
    const { history } = buildServiceTimeline([
      base({ id: "d1", environment: "PROD" }),
    ]);
    expect(history[0].environment).toBe("PROD");
  });
});

describe("buildServiceTimeline rolledBack", () => {
  it("marks a deployment with a rollback as rolledBack", () => {
    const ev = deployEvent("DEPLOYED");
    ev.rollbacks = [{ id: "r1", comment: "revert", previousVersion: null, actorName: null, link: null, createdAt: "2026-07-02T00:00:00.000Z" }];
    const { history } = buildServiceTimeline([ev]);
    const entry = history.find((e) => e.eventId === "d1");
    expect(entry?.rolledBack).toBe(true);
  });
  it("leaves a deployment without rollbacks not rolledBack", () => {
    const { history } = buildServiceTimeline([deployEvent("DEPLOYED")]);
    const entry = history.find((e) => e.eventId === "d1");
    expect(entry?.rolledBack).toBe(false);
  });
});
