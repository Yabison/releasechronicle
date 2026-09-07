import { describe, it, expect } from "vitest";
import { renderChangelog } from "@/lib/changelogRender";

describe("renderChangelog", () => {
  it("renders the markdown a release note actually uses", () => {
    const html = renderChangelog("### Ajouté\n\n- le tri\n- **le filtre**");
    expect(html).toContain("<h3>Ajouté</h3>");
    expect(html).toContain("<li>le tri</li>");
    expect(html).toContain("<strong>le filtre</strong>");
  });

  it("drops a script tag, wherever it comes from", () => {
    const html = renderChangelog("Bonjour <script>alert(1)</script> monde");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
  });

  it("drops a javascript: link but keeps an https one", () => {
    const html = renderChangelog("[piège](javascript:alert(1)) et [ticket](https://jira/AB-1)");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://jira/AB-1"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("demotes h1 and h2 so a note cannot outrank the page title", () => {
    const html = renderChangelog("# Titre\n## Sous-titre");
    expect(html).toContain("<h3>Titre</h3>");
    expect(html).toContain("<h4>Sous-titre</h4>");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
  });

  it("does not render an img, which would leak a page view to its host", () => {
    expect(renderChangelog('<img src="https://tracker/x.gif">')).not.toContain("<img");
  });

  it("keeps an onerror handler out, attribute allowlist and all", () => {
    const html = renderChangelog('<a href="https://x" onerror="alert(1)">lien</a>');
    expect(html).not.toContain("onerror");
  });

  it("returns an empty string for an empty note", () => {
    expect(renderChangelog("").trim()).toBe("");
  });
});
