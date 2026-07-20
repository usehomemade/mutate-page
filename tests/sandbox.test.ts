import { describe, expect, it } from "vitest";

import {
  buildSandboxDocument,
  cleanGeneratedDocument,
  measureDocumentSimilarity,
  validateGeneratedDocument,
} from "@/lib/sandbox";

const action = {
  id: "follow-cats",
  label: "Cats",
  intent: "Evolve toward a page about cats.",
};

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

  it("injects a CSP and a revision-bound bridge", () => {
    const document = buildSandboxDocument(
      page('<button data-evolve="follow-cats">Cats</button>'),
      "revision-123",
      [action],
    );

    expect(document).toContain("Content-Security-Policy");
    expect(document).toContain("navigate-to 'none'");
    expect(document).toContain('const revisionId = "revision-123"');
    expect(document).toContain('new Set(["follow-cats"])');
    expect(document).toContain("data-mutate-bridge");
  });

  it("requires every declared action to exist in the DOM", () => {
    expect(() => validateGeneratedDocument(page("<p>No link</p>"), [action], 50_000))
      .toThrow(/no matching data-evolve/i);

    expect(() =>
      validateGeneratedDocument(
        page('<button data-evolve="follow-cats">Cats</button>'),
        [action],
        50_000,
      ),
    ).not.toThrow();
  });

  it("rejects duplicate actions, oversized pages, and parent communication", () => {
    const valid = page('<button data-evolve="follow-cats">Cats</button>');
    expect(() => validateGeneratedDocument(valid, [action, action], 50_000)).toThrow(/unique/i);
    expect(() => validateGeneratedDocument(valid, [action], 20)).toThrow(/limit/i);
    expect(() =>
      validateGeneratedDocument(
        page('<button data-evolve="follow-cats">Cats</button><script>window.parent.postMessage({})</script>'),
        [action],
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
