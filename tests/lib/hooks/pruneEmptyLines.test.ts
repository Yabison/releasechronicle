import { describe, it, expect } from "vitest";
import { pruneEmptyLines, renderTemplate } from "@/lib/hooks/renderTemplate";

describe("pruneEmptyLines", () => {
  // The templates list every field they could ever show. What makes that usable
  // is staying quiet about the ones this event does not have: a release
  // notification must not read "Type d'incident :" followed by nothing.
  it("drops a field line whose value came out empty", () => {
    const out = pruneEmptyLines("Version : 1.4.2\nType d'incident : \nStatut : DEPLOYED");
    expect(out).toBe("Version : 1.4.2\nStatut : DEPLOYED");
  });

  it("drops a line left holding only separators", () => {
    expect(pruneEmptyLines("Fenêtre :  → \nVersion : 1.0")).toBe("Version : 1.0");
  });

  it("keeps a line whose value survived", () => {
    expect(pruneEmptyLines("Fenêtre : 01/01 → 02/01")).toBe("Fenêtre : 01/01 → 02/01");
  });

  // Prose is not a field, and a colon inside a sentence must not make it one.
  it("keeps a line with no field label", () => {
    const prose = "Release en cours sur weda / wmickey";
    expect(pruneEmptyLines(prose)).toBe(prose);
  });

  // "Action : https://…" has a colon in its value as well as after its label.
  it("keeps a URL", () => {
    const line = "Action : http://localhost:3000/go/abc";
    expect(pruneEmptyLines(line)).toBe(line);
  });

  it("collapses the gap a pruned block leaves behind", () => {
    expect(pruneEmptyLines("A : 1\n\nB : \n\nC : 2")).toBe("A : 1\n\nC : 2");
  });
});

describe("renderTemplate", () => {
  it("substitutes and prunes in one pass", () => {
    const out = renderTemplate(
      "Version : {version}\nType d'incident : {incidentType}\nStatut : {status}",
      { version: "1.4.2", incidentType: "", status: "DEPLOYED" },
    );
    expect(out).toBe("Version : 1.4.2\nStatut : DEPLOYED");
  });

  it("leaves an unknown placeholder alone rather than blanking the line", () => {
    expect(renderTemplate("X : {nope}", {})).toBe("X : {nope}");
  });
});
