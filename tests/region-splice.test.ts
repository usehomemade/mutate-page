import { describe, expect, it } from "vitest";

import {
  annotateRegions,
  appendAssetsToSource,
  findElementBounds,
  findRegionIdForClickedText,
  spliceRegions,
  stripRegionMarkers,
} from "@/lib/sandbox";

function doc(body: string) {
  return `<!doctype html><html><head><title>Test</title><style>div{color:red}</style></head><body>${body}</body></html>`;
}

describe("annotateRegions", () => {
  it("annotates whitelisted block elements in document order", () => {
    const { annotated, count } = annotateRegions(
      doc('<main><h1>Title</h1><p>Text</p><section><ul><li>One</li></ul></section></main>'),
    );

    expect(count).toBe(6);
    expect(annotated).toContain('<main data-mut="0">');
    expect(annotated).toContain('<h1 data-mut="1">');
    expect(annotated).toContain('<p data-mut="2">');
    expect(annotated).toContain('<section data-mut="3">');
    expect(annotated).toContain('<ul data-mut="4">');
    expect(annotated).toContain('<li data-mut="5">');
  });

  it("annotates ordinary links and buttons as their own regions", () => {
    const { annotated, count } = annotateRegions(
      doc('<a href="/somewhere">Go</a>'),
    );
    expect(count).toBe(1);
    expect(annotated).toMatch(/<a data-mut="0" href="\/somewhere">/);
  });

  it("does not annotate elements inside head, script, or style", () => {
    const { annotated, count } = annotateRegions(
      `<!doctype html><html><head><title>Test</title><style>div{color:red}</style></head><body><div>real<script>document.write("<div>fake</div>")</script></div></body></html>`,
    );
    expect(count).toBe(1);
    expect(annotated).not.toContain("<title data-mut");
    expect(annotated).not.toMatch(/fake.*data-mut/);
  });

  it("skips elements that already carry data-mut", () => {
    const { annotated, count } = annotateRegions(
      doc('<div data-mut="7"><p>Text</p></div>'),
    );
    // the outer div already has data-mut so it is skipped; only the inner p gets annotated
    expect(count).toBe(1);
    expect(annotated).toContain('<div data-mut="7">');
    expect(annotated).toContain('<p data-mut="0">');
  });

  it("does not annotate non-whitelisted elements like span", () => {
    const { annotated, count } = annotateRegions(doc('<span>plain</span>'));
    expect(count).toBe(0);
    expect(annotated).not.toContain("data-mut");
  });
});

describe("findRegionIdForClickedText", () => {
  it("finds the smallest region whose text contains the clicked text", () => {
    const { annotated } = annotateRegions(
      doc('<nav><a href="/cats">Cats</a><a href="/dogs">Dogs</a></nav>'),
    );
    expect(findRegionIdForClickedText(annotated, "Cats")).not.toBeNull();
    const id = findRegionIdForClickedText(annotated, "Cats")!;
    const bounds = findElementBounds(annotated, "data-mut", String(id));
    expect(annotated.slice(bounds!.start, bounds!.end)).toContain(">Cats<");
  });

  it("returns null when nothing matches", () => {
    const { annotated } = annotateRegions(doc("<p>Hello</p>"));
    expect(findRegionIdForClickedText(annotated, "Goodbye")).toBeNull();
  });

  it("returns null for empty clicked text", () => {
    const { annotated } = annotateRegions(doc("<p>Hello</p>"));
    expect(findRegionIdForClickedText(annotated, "   ")).toBeNull();
  });
});

describe("findElementBounds", () => {
  it("finds bounds for a simple element", () => {
    const html = doc('<div data-mut="0"><p>Hello</p></div><div data-mut="1">Other</div>');
    const bounds = findElementBounds(html, "data-mut", "0");
    expect(bounds).not.toBeNull();
    const slice = html.slice(bounds!.start, bounds!.end);
    expect(slice).toBe('<div data-mut="0"><p>Hello</p></div>');
  });

  it("handles nested elements of the same tag name", () => {
    const html = doc('<div data-mut="0"><div>inner one</div><div>inner two</div></div>');
    const bounds = findElementBounds(html, "data-mut", "0");
    expect(bounds).not.toBeNull();
    const slice = html.slice(bounds!.start, bounds!.end);
    expect(slice).toBe('<div data-mut="0"><div>inner one</div><div>inner two</div></div>');
  });

  it("returns null for void elements", () => {
    const html = doc('<img data-mut="0" src="a.png">');
    expect(findElementBounds(html, "data-mut", "0")).toBeNull();
  });

  it("returns null when the marker is not found", () => {
    const html = doc('<div data-mut="0">x</div>');
    expect(findElementBounds(html, "data-mut", "5")).toBeNull();
  });

  it("handles self-closing elements", () => {
    const html = doc('<div data-mut="0" />after');
    const bounds = findElementBounds(html, "data-mut", "0");
    expect(bounds).not.toBeNull();
    expect(html.slice(bounds!.start, bounds!.end)).toBe('<div data-mut="0" />');
  });
});

describe("spliceRegions", () => {
  it("replaces a single region", () => {
    const html = doc('<div data-mut="0"><p>Old</p></div>');
    const result = spliceRegions(html, [{ id: 0, html: "<div>New</div>" }]);
    expect(result).toContain("<div>New</div>");
    expect(result).not.toContain("Old");
  });

  it("replaces multiple non-overlapping regions and keeps offsets correct", () => {
    const html = doc(
      '<section data-mut="0"><p data-mut="1">One</p></section><section data-mut="2"><p data-mut="3">Two</p></section>',
    );
    const result = spliceRegions(html, [
      { id: 1, html: "<p>ONE</p>" },
      { id: 3, html: "<p>TWO</p>" },
    ]);
    expect(result).toContain('<section data-mut="0"><p>ONE</p></section>');
    expect(result).toContain('<section data-mut="2"><p>TWO</p></section>');
  });

  it("skips a replacement fully contained within an already-applied outer replacement", () => {
    const html = doc('<div data-mut="0"><p data-mut="1">Inner</p></div>');
    const result = spliceRegions(html, [
      { id: 0, html: '<div data-mut="0"><p data-mut="1">Replaced outer</p></div>' },
      { id: 1, html: "<p>Should be skipped</p>" },
    ]);
    expect(result).toContain("Replaced outer");
    expect(result).not.toContain("Should be skipped");
  });

  it("ignores ids that cannot be found", () => {
    const html = doc('<div data-mut="0">Only</div>');
    const result = spliceRegions(html, [{ id: 99, html: "<div>Nope</div>" }]);
    expect(result).toBe(html);
  });
});

describe("stripRegionMarkers", () => {
  it("removes every data-mut attribute", () => {
    const html = '<div data-mut="0"><p data-mut="1">Text</p></div>';
    const stripped = stripRegionMarkers(html);
    expect(stripped).toBe("<div><p>Text</p></div>");
    expect(stripped).not.toContain("data-mut");
  });
});

describe("appendAssetsToSource", () => {
  it("appends css before </head> and js before </body>", () => {
    const html = doc("<p>Body</p>");
    const result = appendAssetsToSource(html, "p{color:blue}", "console.log(1)");
    expect(result).toContain('<style data-mut-append>p{color:blue}</style></head>');
    expect(result).toContain("<script>console.log(1)</script></body>");
  });

  it("no-ops on empty css/js", () => {
    const html = doc("<p>Body</p>");
    expect(appendAssetsToSource(html, "", "")).toBe(html);
  });

  it("creates a head when none exists", () => {
    const html = "<html><body><p>Body</p></body></html>";
    const result = appendAssetsToSource(html, "p{color:blue}", "");
    expect(result).toContain("<head><style data-mut-append>p{color:blue}</style></head>");
  });
});
