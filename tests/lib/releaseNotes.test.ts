import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  parseReleaseFolder,
  readReleaseNotes,
  noteFor,
  planReleaseNoteImport,
  htmlNoteBody,
  type Deployment,
  type ReleaseNote,
} from "../../prisma/seed/release-notes";
import { renderChangelog } from "@/lib/changelogRender";

const ENVS = ["AZER", "AZER2", "DEMO", "PREPROD", "PROD", "RUN", "SECURE"];
const FIXTURES = join(process.cwd(), "tests/fixtures/releases");

describe("parseReleaseFolder", () => {
  it("reads the environment, the day and the label", () => {
    expect(parseReleaseFolder("secure 2026-09-03 - Hotfix Security", ENVS)).toEqual({
      environments: ["SECURE"],
      date: "2026-09-03",
      label: "Hotfix Security",
    });
  });

  it("reads a release train covering two environments", () => {
    expect(parseReleaseFolder("run secure 2026-02-04 kc-migration", ENVS)).toEqual({
      environments: ["RUN", "SECURE"],
      date: "2026-02-04",
      label: "kc-migration",
    });
  });

  it("accepts a folder with no label at all", () => {
    expect(parseReleaseFolder("secure 2026-01-28", ENVS)).toEqual({
      environments: ["SECURE"],
      date: "2026-01-28",
      label: "",
    });
  });

  // "secure 2026-02-18.2" is the second release of that day. The suffix says
  // nothing a deployment could be matched on, so it is dropped from the date and
  // kept out of the label — two folders then collide on day+env, which noteFor()
  // reports as ambiguous rather than resolving by guesswork.
  it("drops a same-day sequence suffix from the date", () => {
    expect(parseReleaseFolder("secure 2026-02-18.2", ENVS)).toEqual({
      environments: ["SECURE"],
      date: "2026-02-18",
      label: "",
    });
  });

  it("keeps a parenthesised label whole", () => {
    expect(parseReleaseFolder("secure 2026-04-03 (release 20260401)", ENVS)).toEqual({
      environments: ["SECURE"],
      date: "2026-04-03",
      label: "(release 20260401)",
    });
  });

  it("refuses a folder that names no environment", () => {
    expect(parseReleaseFolder("2026-04-03 sans environnement", ENVS)).toBeNull();
  });

  it("refuses a folder that carries no date", () => {
    expect(parseReleaseFolder("notes diverses", ENVS)).toBeNull();
  });

  it("refuses an environment the instance does not define", () => {
    expect(parseReleaseFolder("recette 2026-04-03 essai", ENVS)).toBeNull();
  });
});

describe("readReleaseNotes", () => {
  it("prefers the Markdown note when a folder holds both formats", () => {
    const notes = readReleaseNotes(FIXTURES, ENVS);
    const hotfix = notes.find((n) => n.date === "2026-09-03");
    expect(hotfix?.format).toBe("markdown");
    expect(hotfix?.body).toContain("régression");
    expect(hotfix?.body).not.toContain("<h1>");
  });

  it("falls back to the HTML note when that is all there is", () => {
    const note = readReleaseNotes(FIXTURES, ENVS).find((n) => n.date === "2026-03-04");
    expect(note?.format).toBe("html");
    expect(note?.body).toContain("<p>Note livrée en HTML uniquement.</p>");
  });

  it("finds a note whose filename carries a repository and a date", () => {
    const note = readReleaseNotes(FIXTURES, ENVS).find((n) => n.date === "2026-02-04");
    expect(note?.environments).toEqual(["RUN", "SECURE"]);
    expect(note?.body).toContain("Migration Keycloak");
  });

  it("ignores a folder holding no note, and one whose name says nothing", () => {
    const folders = readReleaseNotes(FIXTURES, ENVS).map((n) => n.folder);
    expect(folders).not.toContain("secure 2026-01-28"); // only a .docx
    expect(folders).not.toContain("notes diverses"); // unparsable name
  });

  it("returns nothing for a directory that does not exist", () => {
    expect(readReleaseNotes(join(FIXTURES, "absent"), ENVS)).toEqual([]);
  });
});

describe("noteFor", () => {
  const note = (over: Partial<ReleaseNote> = {}): ReleaseNote => ({
    folder: "secure 2026-08-27",
    environments: ["SECURE"],
    date: "2026-08-27",
    label: "",
    body: "# Note",
    format: "markdown",
    sourcePath: "/tmp/releasenote.md",
    ...over,
  });

  it("matches a deployment on the same Paris day and environment", () => {
    expect(noteFor([note()], "SECURE", new Date("2026-08-27T09:00:00Z"))).toEqual(note());
  });

  it("matches whatever case the environment is written in", () => {
    expect(noteFor([note()], "secure", new Date("2026-08-27T09:00:00Z"))).toEqual(note());
  });

  // Paris is UTC+2 in August: 22:30Z is already the 28th locally, and the folders
  // were named in Paris time.
  it("uses the Paris day, not the UTC one", () => {
    expect(noteFor([note({ date: "2026-08-28" })], "SECURE", new Date("2026-08-27T22:30:00Z"))).not.toBeNull();
  });

  it("returns null when no note covers that day", () => {
    expect(noteFor([note()], "SECURE", new Date("2026-08-29T09:00:00Z"))).toBeNull();
  });

  it("returns null when the note is for another environment", () => {
    expect(noteFor([note()], "RUN", new Date("2026-08-27T09:00:00Z"))).toBeNull();
  });

  it("matches a train that covers the environment among several", () => {
    const train = note({ environments: ["RUN", "SECURE"] });
    expect(noteFor([train], "RUN", new Date("2026-08-27T09:00:00Z"))).toEqual(train);
  });

  it("refuses to choose between two different notes on the same day", () => {
    const a = note({ folder: "secure 2026-08-27", body: "# A" });
    const b = note({ folder: "secure 2026-08-27.2", body: "# B" });
    expect(noteFor([a, b], "SECURE", new Date("2026-08-27T09:00:00Z"))).toBe("ambiguous");
  });

  it("takes either when two same-day notes carry the same text", () => {
    const a = note({ folder: "secure 2026-08-27", body: "# same" });
    const b = note({ folder: "secure 2026-08-27.2", body: "# same" });
    expect(noteFor([a, b], "SECURE", new Date("2026-08-27T09:00:00Z"))).toEqual(a);
  });
});

describe("planReleaseNoteImport", () => {
  const note = (over: Partial<ReleaseNote> = {}): ReleaseNote => ({
    folder: "secure 2026-08-27",
    environments: ["SECURE"],
    date: "2026-08-27",
    label: "",
    body: "# Note",
    format: "markdown",
    sourcePath: "/tmp/releasenote.md",
    ...over,
  });
  const deploy = (over: Partial<Deployment> = {}): Deployment => ({
    serviceId: "svc-weda",
    serviceSlug: "weda",
    version: "101163",
    environment: "SECURE",
    occurredAt: new Date("2026-08-27T09:00:00Z"),
    ...over,
  });

  it("attaches the note to every service deployed that day", () => {
    const plan = planReleaseNoteImport([note()], [
      deploy(),
      deploy({ serviceId: "svc-wedoc", serviceSlug: "wedoc", version: "2026.08.27-101163" }),
    ]);
    expect(plan.attach).toHaveLength(2);
    expect(plan.attach.map((a) => `${a.serviceSlug}@${a.version}`).sort()).toEqual([
      "weda@101163",
      "wedoc@2026.08.27-101163",
    ]);
    expect(plan.attach[0].body).toBe("# Note");
  });

  // The same build reaching one environment in several runs is one release, so the
  // note is written once rather than queued twice for the same row.
  it("writes one attachment per service and version", () => {
    const plan = planReleaseNoteImport([note()], [
      deploy(),
      deploy({ occurredAt: new Date("2026-08-27T14:00:00Z") }),
    ]);
    expect(plan.attach).toHaveLength(1);
  });

  it("leaves a versionless deployment alone", () => {
    const plan = planReleaseNoteImport([note()], [deploy({ version: null })]);
    expect(plan.attach).toEqual([]);
  });

  it("reports a note that no deployment matched", () => {
    const orphan = note({ folder: "secure 2026-01-01", date: "2026-01-01" });
    const plan = planReleaseNoteImport([orphan], [deploy()]);
    expect(plan.unmatched.map((n) => n.folder)).toEqual(["secure 2026-01-01"]);
  });

  it("reports the day it refused to arbitrate, and writes nothing for it", () => {
    const plan = planReleaseNoteImport(
      [note({ body: "# A" }), note({ folder: "secure 2026-08-27.2", body: "# B" })],
      [deploy()],
    );
    expect(plan.attach).toEqual([]);
    expect(plan.ambiguous).toEqual([{ environment: "SECURE", date: "2026-08-27", serviceSlug: "weda", version: "101163" }]);
  });

  // A build is promoted: RUN one day, SECURE the next, each covered by its own
  // note. The changelog is keyed by service and version alone, so it cannot hold
  // both texts — that conflict is reported instead of letting the later day win.
  it("refuses a version that two different notes would claim", () => {
    const plan = planReleaseNoteImport(
      [
        note({ folder: "run 2026-08-27", environments: ["RUN"], body: "# run" }),
        note({ folder: "secure 2026-08-28", date: "2026-08-28", body: "# secure" }),
      ],
      [
        deploy({ environment: "RUN" }),
        deploy({ environment: "SECURE", occurredAt: new Date("2026-08-28T09:00:00Z") }),
      ],
    );
    expect(plan.attach).toEqual([]);
    expect(plan.conflicts).toEqual([
      { serviceSlug: "weda", version: "101163", folders: ["run 2026-08-27", "secure 2026-08-28"] },
    ]);
  });

  it("accepts a promoted version when both days carry the same note", () => {
    const plan = planReleaseNoteImport(
      [
        note({ folder: "run 2026-08-27", environments: ["RUN"], body: "# same" }),
        note({ folder: "secure 2026-08-28", date: "2026-08-28", body: "# same" }),
      ],
      [
        deploy({ environment: "RUN" }),
        deploy({ environment: "SECURE", occurredAt: new Date("2026-08-28T09:00:00Z") }),
      ],
    );
    expect(plan.attach).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
  });
});

/**
 * The HTML notes are whole documents from the generator — doctype, head, a style
 * block, and everything indented. Stored as-is they render as garbage: Markdown
 * turns any 4-space-indented line into a code block, so the note appears as its
 * own source, and the <title> leaks in as loose text above it.
 */
describe("htmlNoteBody", () => {
  const DOC = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    "  <title>Release Notes</title>",
    "  <style>body { color: red; }</style>",
    "</head>",
    "<body>",
    "  <div>",
    "    <h2>Résumé</h2>",
    "    <ul>",
    "      <li><strong>9</strong> Pull Requests</li>",
    "    </ul>",
    "",
    "    <script>console.log('x');</script>",
    "  </div>",
    "</body>",
    "</html>",
  ].join("\n");

  it("drops the document shell, so the title never shows as text", () => {
    const body = htmlNoteBody(DOC);
    expect(body).not.toContain("Release Notes");
    expect(body).not.toContain("<!DOCTYPE");
    expect(body).not.toContain("<head");
  });

  it("drops the style and the script outright", () => {
    const body = htmlNoteBody(DOC);
    expect(body).not.toContain("color: red");
    expect(body).not.toContain("console.log");
  });

  it("keeps the content and its markup", () => {
    const body = htmlNoteBody(DOC);
    expect(body).toContain("<h2>Résumé</h2>");
    expect(body).toContain("<li><strong>9</strong> Pull Requests</li>");
  });

  // The one property that matters: no line break and no leading run of spaces
  // means Markdown has nothing to mistake for an indented code block.
  it("leaves no newline for Markdown to read as a code block", () => {
    expect(htmlNoteBody(DOC)).not.toContain("\n");
  });

  it("passes a plain fragment through unharmed", () => {
    expect(htmlNoteBody("<h1>Release</h1>\n<p>Court.</p>")).toBe("<h1>Release</h1> <p>Court.</p>");
  });

  it("renders to readable HTML rather than to its own source", () => {
    const html = renderChangelog(htmlNoteBody(DOC));
    expect(html).not.toContain("<pre>");
    expect(html).not.toContain("&lt;h2&gt;");
    expect(html).toContain("Résumé");
    expect(html).toContain("Pull Requests");
  });
});

describe("readReleaseNotes, on a generator document", () => {
  it("stores the HTML note already stripped of its shell", () => {
    const note = readReleaseNotes(FIXTURES, ENVS).find((n) => n.date === "2026-03-11");
    expect(note?.format).toBe("html");
    expect(note?.body).not.toContain("<!DOCTYPE");
    expect(note?.body).not.toContain("\n");
    expect(renderChangelog(note!.body)).not.toContain("<pre>");
  });
});
