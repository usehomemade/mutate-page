import { describe, expect, it } from "vitest";

import {
  buildSandboxDocument,
  cleanGeneratedDocument,
  measureDocumentSimilarity,
  validateGeneratedDocument,
} from "@/lib/sandbox";

function page(body: string) {
  return `<!doctype html><html><head><title>Test</title></head><body>${body}</body></html>`;
}

describe("generated document sandbox", () => {
  it("removes external executable and embedded document elements", () => {
    const dirty = page(`
      <base href="https://example.com">
      <link rel="stylesheet" href="https://example.com/a.css">
      <script src="https://example.com/a.js"></script>
      <iframe src="https://example.com"></iframe>
      <p>survives</p>
    `);

    const clean = cleanGeneratedDocument(dirty);
    expect(clean).toContain("survives");
    expect(clean).not.toMatch(/<base\b/i);
    expect(clean).not.toMatch(/<link\b/i);
    expect(clean).not.toMatch(/script src/i);
    expect(clean).not.toMatch(/<iframe\b/i);
  });

  it("injects a CSP and a revision-bound bridge with no experiment-aware markup required", () => {
    const document = buildSandboxDocument(
      page('<a href="/another-page">Cats</a>'),
      "revision-123",
    );

    expect(document).toContain("Content-Security-Policy");
    expect(document).toContain("navigate-to 'none'");
    expect(document).toContain('const revisionId = "revision-123"');
    expect(document).toContain("if (!event.isTrusted) return");
    expect(document).toContain("data-mutate-bridge");
    expect(document).not.toContain("data-evolve");
  });

  it("turns ordinary page navigation into a fresh mutation, reporting what was clicked", () => {
    const document = buildSandboxDocument(
      page('<a href="/another-page">Another page</a>'),
      "revision-123",
    );

    expect(document).toContain('event.target.closest("a[href]');
    expect(document).toContain("clickedText");
    expect(document).toContain("clickedTag");
  });

  it("passes plain pages with no declared actions or metadata", () => {
    expect(() =>
      validateGeneratedDocument(page("<p>No link</p>"), 50_000),
    ).not.toThrow();
  });

  it("rejects oversized pages and parent communication", () => {
    const valid = page('<a href="/another-page">Cats</a>');
    expect(() => validateGeneratedDocument(valid, 20)).toThrow(/limit/i);
    expect(() =>
      validateGeneratedDocument(
        page('<a href="/another-page">Cats</a><script>window.parent.postMessage({})</script>'),
        50_000,
      ),
    ).toThrow(/outside its sandbox/i);
  });
});

describe("document similarity", () => {
  it("scores identical pages as one and unrelated pages lower", () => {
    const original = page("<main><h1>Dogs</h1><p>A field guide to friendly dogs.</p></main>");
    const related = page("<main><h1>Dogs</h1><p>A visual field guide to friendly dogs.</p></main>");
    const unrelated = page("<canvas></canvas><script>let score=0</script>");

    expect(measureDocumentSimilarity(original, original)).toBe(1);
    expect(measureDocumentSimilarity(original, related)).toBeGreaterThan(
      measureDocumentSimilarity(original, unrelated),
    );
  });
});
