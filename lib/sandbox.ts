import { createHash } from "node:crypto";

import type { EvolutionaryAction } from "@/lib/mutation-schema";

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

function bridgeScript(revisionId: string, actions: EvolutionaryAction[]) {
  const allowed = JSON.stringify(actions.map((action) => action.id)).replace(
    /<\//g,
    "<\\/",
  );
  const safeRevisionId = JSON.stringify(revisionId);

  return `<script data-mutate-bridge>
(() => {
  "use strict";
  const revisionId = ${safeRevisionId};
  const allowedActions = new Set(${allowed});

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-evolve]")
      : null;

    if (target) {
      const actionId = target.getAttribute("data-evolve");
      if (!actionId || !allowedActions.has(actionId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.parent.postMessage({
        type: "mutate-page:evolve",
        revisionId,
        actionId,
      }, "*");
      return;
    }

    const link = event.target instanceof Element
      ? event.target.closest("a[href]")
      : null;
    if (link) {
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("#")) event.preventDefault();
    }
  }, true);
})();
</script>`;
}

export function buildSandboxDocument(
  source: string,
  revisionId: string,
  actions: EvolutionaryAction[],
) {
  let html = cleanGeneratedDocument(source);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${sandboxCsp}">`;
  html = html.replace(/<head\b[^>]*>/i, (match) => `${match}${meta}`);

  const bridge = bridgeScript(revisionId, actions);
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${bridge}</body>`);
  } else {
    html += bridge;
  }

  return html;
}

export function validateGeneratedDocument(
  html: string,
  actions: EvolutionaryAction[],
  maxBytes: number,
) {
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

  const uniqueIds = new Set(actions.map((action) => action.id));
  if (uniqueIds.size !== actions.length) {
    throw new Error("Generated evolutionary action IDs must be unique.");
  }

  for (const action of actions) {
    const escaped = action.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const marker = new RegExp(
      `data-evolve\\s*=\\s*["']${escaped}["']`,
      "i",
    );
    if (!marker.test(html)) {
      throw new Error(
        `Action ${action.id} is declared but no matching data-evolve element exists.`,
      );
    }
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
