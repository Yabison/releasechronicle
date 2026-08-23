import { describe, it, expect } from "vitest";
import { emailHtml, escapeHtml, isSafeActionUrl } from "@/lib/hooks/connectors/emailHtml";

describe("escapeHtml", () => {
  // The body carries comments people typed. A comment reaching a mail client
  // as markup is the same injection as on a page, in a place nobody reviews.
  it("neutralises markup", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s");
  });
});

describe("isSafeActionUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeActionUrl("https://example.org/go/abc")).toBe(true);
    expect(isSafeActionUrl("http://localhost:3000/go/abc")).toBe(true);
  });

  // The URL goes straight into an href. A scheme that runs code there would be
  // a link that does something other than open a page.
  it("refuses anything that is not a web address", () => {
    expect(isSafeActionUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeActionUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeActionUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeActionUrl("not a url")).toBe(false);
    expect(isSafeActionUrl("")).toBe(false);
  });
});

describe("emailHtml", () => {
  const url = "https://example.org/go/abc";

  it("renders the action as a button", () => {
    const html = emailHtml({ body: "Version : 1.0", actionUrl: url, actionLabel: "Ouvrir" });
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(">Ouvrir<");
  });

  // The text part already spells the link out; repeating it above the button
  // says the same thing twice.
  it("drops the line that held the raw link", () => {
    const html = emailHtml({ body: `Version : 1.0\nAction : ${url}`, actionUrl: url, actionLabel: "Ouvrir" });
    expect(html).toContain("Version : 1.0");
    expect(html).not.toContain(`Action : ${url}`);
  });

  it("renders no button when the event carries no action", () => {
    const html = emailHtml({ body: "Version : 1.0", actionUrl: "", actionLabel: "Ouvrir" });
    expect(html).not.toContain("<a href");
  });

  // A button pointing at javascript: would be worse than no button.
  it("renders no button for an unsafe scheme", () => {
    const html = emailHtml({ body: "x", actionUrl: "javascript:alert(1)", actionLabel: "Ouvrir" });
    expect(html).not.toContain("<a href");
  });

  it("escapes the body it embeds", () => {
    const html = emailHtml({ body: "<b>bold</b>", actionUrl: "", actionLabel: "" });
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>bold</b>");
  });
});
