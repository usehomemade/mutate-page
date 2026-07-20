import "server-only";

import { getDatabase } from "@/lib/db";
import { buildSandboxDocument, contentHash } from "@/lib/sandbox";
import { getObjectStorage } from "@/lib/storage";

export const SHARED_WORLD_ID = "world-shared";
export const SHARED_WORLD_SLUG = "shared";
export const ROOT_REVISION_ID = "primordial";

const primordialSource = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Primordial page</title>
    <style>
      :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh; margin: 0; display: grid; place-items: center;
        color: #f3f1e8; background:
          radial-gradient(circle at 50% 45%, rgba(226,255,91,.14), transparent 22rem),
          #11110f;
      }
      main { width: min(36rem, calc(100% - 3rem)); text-align: center; }
      .cell {
        width: 5.5rem; aspect-ratio: 1; margin: 0 auto 2rem; border-radius: 48% 52% 58% 42%;
        border: 1px solid rgba(226,255,91,.65); background: rgba(226,255,91,.08);
        box-shadow: 0 0 5rem rgba(226,255,91,.16); animation: breathe 5s ease-in-out infinite;
      }
      h1 { margin: 0; font-size: clamp(2rem, 7vw, 4.5rem); letter-spacing: -.08em; }
      p { color: #a7a59c; line-height: 1.7; }
      small { display: block; margin-top: 2rem; color: #706f69; }
      @keyframes breathe { 50% { transform: scale(1.08) rotate(8deg); border-radius: 56% 44% 40% 60%; } }
      @media (prefers-reduced-motion: reduce) { .cell { animation: none; } }
    </style>
  </head>
  <body>
    <main>
      <div class="cell" aria-hidden="true"></div>
      <h1>nothing, yet.</h1>
      <p>This is the primordial page. Use the mutation control outside this specimen to begin the shared evolutionary tree.</p>
      <small>revision 0 · awaiting selection pressure</small>
    </main>
  </body>
</html>`;

export async function ensureSharedWorld() {
  const { sqlite } = getDatabase();
  const existing = sqlite
    .prepare(`SELECT * FROM worlds WHERE id = ?`)
    .get(SHARED_WORLD_ID);
  if (existing) return;

  const now = new Date().toISOString();
  const prefix = `worlds/${SHARED_WORLD_ID}/revisions/${ROOT_REVISION_ID}`;
  const sourceKey = `${prefix}/source.html`;
  const pageKey = `${prefix}/page.html`;
  const manifestKey = `${prefix}/manifest.json`;
  const generationKey = `${prefix}/generation.json`;
  const page = buildSandboxDocument(primordialSource, ROOT_REVISION_ID, []);
  const hash = contentHash(primordialSource);
  const storage = getObjectStorage();

  await Promise.all([
    storage.put(sourceKey, primordialSource, {
      contentType: "text/html; charset=utf-8",
      cacheControl: "public, max-age=31536000, immutable",
    }),
    storage.put(pageKey, page, {
      contentType: "text/html; charset=utf-8",
      cacheControl: "public, max-age=31536000, immutable",
    }),
    storage.put(
      manifestKey,
      JSON.stringify(
        {
          schemaVersion: 1,
          worldId: SHARED_WORLD_ID,
          revisionId: ROOT_REVISION_ID,
          parentRevisionId: null,
          title: "Primordial page",
          summary: "The fixed root of the shared evolutionary tree.",
          contentHash: hash,
          actions: [],
          createdAt: now,
        },
        null,
        2,
      ),
      { contentType: "application/json" },
    ),
    storage.put(
      generationKey,
      JSON.stringify(
        { schemaVersion: 1, generator: "built-in", costMicrousd: 0 },
        null,
        2,
      ),
      { contentType: "application/json" },
    ),
  ]);

  sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO worlds (
          id, slug, name, root_revision_id, current_revision_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        SHARED_WORLD_ID,
        SHARED_WORLD_SLUG,
        "The shared organism",
        ROOT_REVISION_ID,
        ROOT_REVISION_ID,
        now,
      );
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO revisions (
          id, world_id, parent_id, depth, status, title, summary, dna_json,
          mutation_json, source_key, page_key, manifest_key, generation_key,
          content_hash, model, cost_microusd, created_at, completed_at
        ) VALUES (?, ?, NULL, 0, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        ROOT_REVISION_ID,
        SHARED_WORLD_ID,
        "Primordial page",
        "The fixed root of the shared evolutionary tree.",
        JSON.stringify({
          topic: "nothing",
          visualStyle: "dark primordial minimalism",
          layout: "single centered cell",
          interactiveFeatures: [],
          inheritedTraits: ["begin from almost nothing"],
        }),
        JSON.stringify({
          description: "The primordial ancestor.",
          changes: [],
          similarity: 1,
        }),
        sourceKey,
        pageKey,
        manifestKey,
        generationKey,
        hash,
        "built-in",
        now,
        now,
      );
  })();
}

