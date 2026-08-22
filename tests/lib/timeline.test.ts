import { describe, it, expect } from "vitest";
import { toClientEvents, filterEvents, groupByDay, eventAppearance, calendarCells, type ClientEvent } from "@/lib/timeline";

function ev(over: Partial<ClientEvent> = {}): ClientEvent {
  return {
    id: "e1", serviceId: "s1", environment: "PROD", type: "DEPLOYMENT",
    occurredAt: "2026-06-25T10:00:00.000Z",
    version: "1.0.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED",
    incidentType: null, incidentStatus: null, startedAt: null, resolvedAt: null, comment: null,
    windowStart: null, windowEnd: null,
    tags: [], causedById: null, parentId: null, hourType: null, derived: {}, lot: null,
    rollbacks: [], qaValidations: [], observations: [], statusTransitions: [], comments: [],
    ...over,
  };
}

describe("toClientEvents", () => {
  it("serializes Date fields to ISO strings and keeps derived + annotations", () => {
    const row = {
      id: "e1", serviceId: "s1", environment: "PROD", type: "DEPLOYMENT",
      occurredAt: new Date("2026-06-25T10:00:00Z"),
      version: "1.0.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED",
      incidentType: null, startedAt: null, resolvedAt: null, comment: null,
      windowStart: null, windowEnd: null, tags: ["a"], causedById: null, parentId: null, hourType: null,
      derived: { }, rollbacks: [{ id: "r1", comment: "x", previousVersion: null, actorName: null, link: null, createdAt: new Date("2026-06-25T10:00:00Z") }], qaValidations: [], observations: [],
    };
    const [c] = toClientEvents([row as never]);
    expect(c.occurredAt).toBe("2026-06-25T10:00:00.000Z");
    expect(c.tags).toEqual(["a"]);
    expect(c.rollbacks).toHaveLength(1);
  });
});

describe("filterEvents", () => {
  const events = [
    ev({ id: "a", environment: "PROD", type: "DEPLOYMENT", serviceId: "s1", occurredAt: "2026-06-25T10:00:00.000Z", tags: ["db"] }),
    ev({ id: "b", environment: "QA", type: "INCIDENT", serviceId: "s2", occurredAt: "2026-06-20T10:00:00.000Z", tags: [] }),
  ];
  it("filters by environment", () => {
    expect(filterEvents(events, { environment: "PROD" }).map((e) => e.id)).toEqual(["a"]);
  });
  it("filters by type and service", () => {
    expect(filterEvents(events, { type: "INCIDENT", serviceId: "s2" }).map((e) => e.id)).toEqual(["b"]);
  });
  it("filters by date range (inclusive ISO compare)", () => {
    expect(filterEvents(events, { from: "2026-06-24", to: "2026-06-26" }).map((e) => e.id)).toEqual(["a"]);
  });
  it("filters by tags (must contain all)", () => {
    expect(filterEvents(events, { tags: ["db"] }).map((e) => e.id)).toEqual(["a"]);
  });
  it("returns all when criteria empty", () => {
    expect(filterEvents(events, {})).toHaveLength(2);
  });
});

describe("groupByDay", () => {
  it("groups by UTC day, newest day first, newest event first within a day", () => {
    const events = [
      ev({ id: "a", occurredAt: "2026-06-25T08:00:00.000Z" }),
      ev({ id: "b", occurredAt: "2026-06-25T12:00:00.000Z" }),
      ev({ id: "c", occurredAt: "2026-06-24T09:00:00.000Z" }),
    ];
    const groups = groupByDay(events);
    expect(groups.map((g) => g.day)).toEqual(["2026-06-25", "2026-06-24"]);
    expect(groups[0].events.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("eventAppearance", () => {
  it("deployment is green, red when failed", () => {
    expect(eventAppearance(ev({ type: "DEPLOYMENT", deployStatus: "DEPLOYED" })).color).toBe("green");
    expect(eventAppearance(ev({ type: "DEPLOYMENT", deployStatus: "PENDING" })).color).toBe("orange");
  });
  it("deployment is red once rolled back, overriding its status", () => {
    const rb = [{ id: "r1", comment: "x", previousVersion: null, actorName: null, link: null, createdAt: "2026-06-25T10:00:00.000Z" }];
    expect(eventAppearance(ev({ type: "DEPLOYMENT", deployStatus: "DEPLOYED", rollbacks: rb })).color).toBe("red");
  });
  it("incident is orange and striped while open", () => {
    const a = eventAppearance(ev({ type: "INCIDENT", derived: { open: true, minutes: 5 } }));
    expect(a.color).toBe("orange");
    expect(a.striped).toBe(true);
  });
  it("maintenance is blue with the derived status badge", () => {
    const a = eventAppearance(ev({ type: "MAINTENANCE", derived: { status: "Upcoming" } }));
    expect(a.color).toBe("blue");
    expect(a.badge).toBe("Upcoming");
  });
});

describe("calendarCells", () => {
  it("places a single-day event on its day, marks outside days", () => {
    const events = [ev({ id: "a", type: "DEPLOYMENT", occurredAt: "2026-06-15T10:00:00.000Z" })];
    const weeks = calendarCells(events, 2026, 6); // June 2026
    const flat = weeks.flat();
    const cell = flat.find((c) => c.date === "2026-06-15")!;
    expect(cell.events.map((e) => e.id)).toEqual(["a"]);
    expect(cell.outside).toBe(false);
    expect(flat.some((c) => c.outside)).toBe(true); // grid pads with adjacent-month days
    expect(flat).toHaveLength(weeks.length * 7);
  });
  it("shades every day a maintenance window covers", () => {
    const events = [ev({ id: "m", type: "MAINTENANCE", windowStart: "2026-06-10T22:00:00.000Z", windowEnd: "2026-06-12T02:00:00.000Z" })];
    const flat = calendarCells(events, 2026, 6).flat();
    const covered = flat.filter((c) => c.maintenances.some((m) => m.id === "m")).map((c) => c.date);
    expect(covered).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
  });
});

describe("toClientEvents rollback mapping", () => {
  it("carries rollback createdAt as ISO", () => {
    const rows = [
      {
        id: "e1",
        serviceId: "s1",
        environment: "PROD",
        type: "DEPLOYMENT",
        occurredAt: new Date("2026-06-20T14:10:00Z"),
        rollbacks: [
          { id: "r1", comment: "Retour v2.4.0", previousVersion: null, actorName: null, link: null, createdAt: new Date("2026-06-20T14:54:00Z") },
        ],
        qaValidations: [],
        observations: [],
        derived: {},
      },
    ];
    const [ev] = toClientEvents(rows);
    expect(ev.rollbacks[0].createdAt).toBe("2026-06-20T14:54:00.000Z");
  });
});

describe("toClientEvents lot", () => {
  it("maps lot (null when absent)", () => {
    const [a] = toClientEvents([{ id: "e1", serviceId: "s", environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date("2026-07-01T00:00:00Z"), tags: [], derived: {}, lot: "1.0.0" }]);
    expect(a.lot).toBe("1.0.0");
    const [b] = toClientEvents([{ id: "e2", serviceId: "s", environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date("2026-07-01T00:00:00Z"), tags: [], derived: {} }]);
    expect(b.lot).toBeNull();
  });
});

describe("toClientEvents statusTransitions", () => {
  it("maps status transitions with ISO createdAt", () => {
    const [ev] = toClientEvents([{
      id: "e1", serviceId: "s1", environment: "PROD", type: "DEPLOYMENT",
      occurredAt: new Date("2026-07-01T00:00:00Z"), tags: [], derived: {},
      statusTransitions: [{
        id: "t1", fromStatus: "PENDING", toStatus: "IN_PROGRESS",
        actorName: "Alice", actorEmail: "a@x.io", comment: "go",
        createdAt: new Date("2026-07-01T01:00:00Z"),
      }],
    }]);
    expect(ev.statusTransitions).toHaveLength(1);
    expect(ev.statusTransitions[0]).toEqual({
      id: "t1", fromStatus: "PENDING", toStatus: "IN_PROGRESS",
      actorName: "Alice", actorEmail: "a@x.io", comment: "go",
      createdAt: "2026-07-01T01:00:00.000Z",
    });
  });
  it("defaults to an empty array when absent", () => {
    const [ev] = toClientEvents([{
      id: "e1", serviceId: "s1", environment: "PROD", type: "DEPLOYMENT",
      occurredAt: new Date("2026-07-01T00:00:00Z"), tags: [], derived: {},
    }]);
    expect(ev.statusTransitions).toEqual([]);
  });
});
