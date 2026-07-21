import { createHash } from "node:crypto";

const sandboxCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
].join("; ");

export const sandboxResponseCsp = sandboxCsp;

export function cleanGeneratedDocument(input: string) {
  let html = input.trim();

  html = html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?(?:refresh|content-security-policy)["']?[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel\s*=\s*["']?(?:stylesheet|preload|modulepreload)["']?[^>]*>/gi, "")
    .replace(/<script\b[^>]*\bsrc\s*=\s*[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(?:iframe|frame|object|embed)\b[^>]*>[\s\S]*?<\/(?:iframe|frame|object|embed)\s*>/gi, "")
    .replace(/<(?:iframe|frame|object|embed)\b[^>]*\/?\s*>/gi, "");

  if (!/<html\b/i.test(html)) {
    html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  }
  if (!/<!doctype\s+html/i.test(html)) {
    html = `<!doctype html>\n${html}`;
  }
  if (!/<head\b/i.test(html)) {
    html = html.replace(/<html\b[^>]*>/i, (match) => `${match}<head></head>`);
  }
  if (!/<body\b/i.test(html)) {
    html = html.replace(/<\/head>/i, "</head><body>").replace(/<\/html>/i, "</body></html>");
  }

  return html;
}

/**
 * The page itself carries no special "this is an evolutionary link" markup —
 * the generator writes ordinary HTML, unaware it is part of this experiment.
 * Any click on an ordinary navigation-shaped control (a real href, or a
 * button standing in for one) is treated as a request to evolve. What the
 * visitor clicked (its text and tag) is reported alongside the request so a
 * later step can infer intent from it; this bridge does no interpretation.
 */
function bridgeScript(revisionId: string) {
  const safeRevisionId = JSON.stringify(revisionId);

  return `<script data-mutate-bridge>
(() => {
  "use strict";
  const revisionId = ${safeRevisionId};

  document.addEventListener("click", (event) => {
    if (!event.isTrusted) return;

    const target = event.target instanceof Element
      ? event.target.closest("a[href], button[data-href], button[formaction], [role='link'][data-href]")
      : null;
    if (!target) return;

    const href = target.getAttribute("href") || "";
    if (href.startsWith("#")) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const clickedText = (target.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 200);
    const clickedTag = target.tagName.toLowerCase();

    window.parent.postMessage({
      type: "mutate-page:evolve",
      revisionId,
      clickedText,
      clickedTag,
    }, "*");
  }, true);
})();
</script>`;
}

export function buildSandboxDocument(source: string, revisionId: string) {
  let html = cleanGeneratedDocument(source);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${sandboxCsp}">`;
  html = html.replace(/<head\b[^>]*>/i, (match) => `${match}${meta}`);

  const bridge = bridgeScript(revisionId);
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${bridge}</body>`);
  } else {
    html += bridge;
  }

  return html;
}

export function validateGeneratedDocument(html: string, maxBytes: number) {
  const size = Buffer.byteLength(html, "utf8");
  if (size > maxBytes) {
    throw new Error(`Generated page is ${size} bytes; the limit is ${maxBytes}.`);
  }

  const blockedCommunication = [
    /\bwindow\s*\.\s*parent\b/i,
    /\bwindow\s*\.\s*top\b/i,
    /\bparent\s*\.\s*postMessage\b/i,
    /\btop\s*\.\s*(?:location|postMessage)\b/i,
  ];
  if (blockedCommunication.some((pattern) => pattern.test(html))) {
    throw new Error("Generated page attempted to communicate outside its sandbox.");
  }
}

function tokensForSimilarity(html: string) {
  const tags = [...html.matchAll(/<([a-z][a-z0-9-]*)\b/gi)].map((match) =>
    match[1].toLowerCase(),
  );
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g);

  return new Set([...tags.map((tag) => `tag:${tag}`), ...(text || [])]);
}

export function measureDocumentSimilarity(before: string, after: string) {
  const a = tokensForSimilarity(before);
  const b = tokensForSimilarity(after);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / union.size;
}

export function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

const REGION_WHITELIST = new Set([
  "section",
  "article",
  "main",
  "header",
  "footer",
  "aside",
  "nav",
  "div",
  "ul",
  "ol",
  "li",
  "figure",
  "table",
  "h1",
  "h2",
  "h3",
  "p",
  "a",
  "button",
]);

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function maskScriptsAndStyles(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (match) => " ".repeat(match.length))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, (match) => " ".repeat(match.length));
}

/**
 * Injects a data-mut="N" attribute (N incrementing from 0 in document order)
 * onto opening tags of whitelisted block-level container elements. Elements
 * inside <head>, <script>, or <style> are skipped, as are elements that
 * already carry a data-mut attribute.
 */
export function annotateRegions(source: string): { annotated: string; count: number } {
  const bodyOpenMatch = source.match(/<body\b[^>]*>/i);
  const bodyStart = bodyOpenMatch ? (bodyOpenMatch.index || 0) + bodyOpenMatch[0].length : 0;
  const bodyCloseIndex = source.search(/<\/body\s*>/i);
  const bodyEnd = bodyCloseIndex === -1 ? source.length : bodyCloseIndex;

  const before = source.slice(0, bodyStart);
  const bodyContent = source.slice(bodyStart, bodyEnd);
  const after = source.slice(bodyEnd);

  const masked = maskScriptsAndStyles(bodyContent);
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;

  let count = 0;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(masked))) {
    const tagName = match[1].toLowerCase();
    const attrs = match[2];
    const hasDataMut = /\bdata-mut\s*=/.test(attrs);
    const eligible = !hasDataMut && REGION_WHITELIST.has(tagName);

    if (eligible) {
      const start = match.index;
      const end = start + match[0].length;
      result += bodyContent.slice(lastIndex, start);
      const original = bodyContent.slice(start, end);
      const insertPos = 1 + tagName.length;
      result += `${original.slice(0, insertPos)} data-mut="${count}"${original.slice(insertPos)}`;
      count += 1;
      lastIndex = end;
    }
  }
  result += bodyContent.slice(lastIndex);

  return { annotated: before + result + after, count };
}

/**
 * Locates the opening tag containing markerAttr="markerValue", then scans
 * forward counting nested opening/closing tags of the same tag name to find
 * the matching close tag. Returns the [start, end) span covering the whole
 * element including its close tag, or null if not found or the element is a
 * void element with no possible closing bounds.
 */
export function findElementBounds(
  html: string,
  markerAttr: string,
  markerValue: string,
): { start: number; end: number } | null {
  const escapedAttr = markerAttr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedValue = markerValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attrPattern = new RegExp(`\\b${escapedAttr}\\s*=\\s*["']${escapedValue}["']`);
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;

  let found: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html))) {
    if (attrPattern.test(match[2])) {
      found = match;
      break;
    }
  }
  if (!found) return null;

  const tagName = found[1].toLowerCase();
  const fullTag = found[0];
  const start = found.index;

  if (VOID_ELEMENTS.has(tagName)) return null;
  if (/\/\s*>$/.test(fullTag)) {
    return { start, end: start + fullTag.length };
  }

  const scanRegex = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}\\s*>`, "gi");
  scanRegex.lastIndex = start + fullTag.length;
  let depth = 1;
  let scanMatch: RegExpExecArray | null;
  while ((scanMatch = scanRegex.exec(html))) {
    const text = scanMatch[0];
    if (/^<\//.test(text)) {
      depth -= 1;
    } else if (!/\/\s*>$/.test(text)) {
      depth += 1;
    }
    if (depth === 0) {
      return { start, end: scanMatch.index + text.length };
    }
  }

  return null;
}

/**
 * Replaces each region referenced by data-mut id with its replacement HTML.
 * Applies non-overlapping, outermost-first: a replacement whose region is
 * fully contained within an already-accepted region is skipped. IDs that
 * cannot be located are ignored.
 */
export function spliceRegions(
  annotated: string,
  replacements: { id: number; html: string }[],
): string {
  const located: { start: number; end: number; html: string }[] = [];
  for (const replacement of replacements) {
    const bounds = findElementBounds(annotated, "data-mut", String(replacement.id));
    if (bounds) {
      located.push({ start: bounds.start, end: bounds.end, html: replacement.html });
    }
  }

  located.sort((a, b) => a.start - b.start);

  const accepted: { start: number; end: number; html: string }[] = [];
  for (const region of located) {
    const containedInAccepted = accepted.some(
      (existing) => region.start >= existing.start && region.end <= existing.end,
    );
    if (!containedInAccepted) accepted.push(region);
  }

  accepted.sort((a, b) => b.start - a.start);

  let result = annotated;
  for (const region of accepted) {
    result = result.slice(0, region.start) + region.html + result.slice(region.end);
  }
  return result;
}

/** Removes every data-mut="N" attribute from the document. */
export function stripRegionMarkers(html: string): string {
  return html.replace(/\s*\bdata-mut\s*=\s*"\d+"/g, "");
}

/**
 * Best-effort match from a visitor's raw clicked text back to the data-mut
 * region they most likely clicked. There is no declared link between a click
 * and a region — the generator never annotates intent — so this just finds
 * the smallest annotated region whose visible text contains the clicked
 * text. Returns null if nothing matches closely enough to be useful.
 */
export function findRegionIdForClickedText(
  annotated: string,
  clickedText: string,
): number | null {
  const needle = clickedText.trim().toLowerCase();
  if (!needle) return null;

  const idRegex = /\bdata-mut\s*=\s*"(\d+)"/g;
  let match: RegExpExecArray | null;
  let best: { id: number; length: number } | null = null;

  while ((match = idRegex.exec(annotated))) {
    const bounds = findElementBounds(annotated, "data-mut", match[1]);
    if (!bounds) continue;
    const inner = annotated
      .slice(bounds.start, bounds.end)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!inner || !inner.includes(needle)) continue;
    if (!best || inner.length < best.length) {
      best = { id: Number(match[1]), length: inner.length };
    }
  }

  return best ? best.id : null;
}

/**
 * Appends extra CSS/JS to a source document as part of the clean source
 * (before the sandbox CSP/bridge is layered on by buildSandboxDocument).
 */
export function appendAssetsToSource(source: string, css: string, js: string): string {
  let html = source;

  if (css.trim()) {
    const styleTag = `<style data-mut-append>${css}</style>`;
    if (/<\/head\s*>/i.test(html)) {
      html = html.replace(/<\/head\s*>/i, `${styleTag}</head>`);
    } else if (/<head\b[^>]*>/i.test(html)) {
      html = html.replace(/<head\b[^>]*>/i, (match) => `${match}${styleTag}`);
    } else if (/<html\b[^>]*>/i.test(html)) {
      html = html.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${styleTag}</head>`);
    } else {
      html = `<head>${styleTag}</head>${html}`;
    }
  }

  if (js.trim()) {
    const scriptTag = `<script>${js}</script>`;
    if (/<\/body\s*>/i.test(html)) {
      html = html.replace(/<\/body\s*>/i, `${scriptTag}</body>`);
    } else {
      html += scriptTag;
    }
  }

  return html;
}
