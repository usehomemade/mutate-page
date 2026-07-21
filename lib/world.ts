import "server-only";

import { getDatabase } from "@/lib/db";
import { errorForLog, logError } from "@/lib/log";
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
      html, body { height: 100%; }
      body { margin: 0; display: grid; place-items: center; }
    </style>
  </head>
  <body>
    <button type="button" data-href="mutate">mutate</button>
  </body>
</html>`;

const primordialDna = {
  topic: "nothing",
  visualStyle: "unstyled native HTML",
  layout: "one centered button",
  interactiveFeatures: ["mutation button"],
  inheritedTraits: ["begin from almost nothing"],
};

const primordialMutation = {
  description: "The primordial ancestor.",
  changes: [],
  similarity: 1,
};

function primordialKeys() {
  const prefix = `worlds/${SHARED_WORLD_ID}/revisions/${ROOT_REVISION_ID}`;
  return {
    sourceKey: `${prefix}/source.html`,
    pageKey: `${prefix}/page.html`,
    manifestKey: `${prefix}/manifest.json`,
    generationKey: `${prefix}/generation.json`,
  };
}

export async function ensureSharedWorld() {
  const { sqlite } = getDatabase();
  const hash = contentHash(primordialSource);
  const existing = sqlite
    .prepare(
      `SELECT w.id, r.content_hash AS contentHash
       FROM worlds w
       LEFT JOIN revisions r ON r.id = w.root_revision_id
       WHERE w.id = ?`,
    )
    .get(SHARED_WORLD_ID) as { id: string; contentHash: string | null } | undefined;
  if (existing?.contentHash === hash) return;

  const now = new Date().toISOString();
  const { sourceKey, pageKey, manifestKey, generationKey } = primordialKeys();
  const page = buildSandboxDocument(primordialSource, ROOT_REVISION_ID);
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
          summary: "One unstyled button at the root of the shared tree.",
          contentHash: hash,
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
        "One unstyled button at the root of the shared tree.",
        JSON.stringify(primordialDna),
        JSON.stringify(primordialMutation),
        sourceKey,
        pageKey,
        manifestKey,
        generationKey,
        hash,
        "built-in",
        now,
        now,
      );

    sqlite
      .prepare(
        `UPDATE worlds
         SET root_revision_id = ?, current_revision_id = COALESCE(current_revision_id, ?)
         WHERE id = ?`,
      )
      .run(ROOT_REVISION_ID, ROOT_REVISION_ID, SHARED_WORLD_ID);
    sqlite
      .prepare(
        `UPDATE revisions SET
          status = 'ready', title = ?, summary = ?, dna_json = ?, mutation_json = ?,
          source_key = ?, page_key = ?, manifest_key = ?, generation_key = ?,
          content_hash = ?, model = 'built-in', temperature = NULL,
          mutation_strength = NULL, openrouter_generation_id = NULL,
          prompt_tokens = 0, completion_tokens = 0, reasoning_tokens = 0,
          cost_microusd = 0, cost_is_estimate = 0, error_message = NULL,
          completed_at = ?
         WHERE id = ? AND world_id = ?`,
      )
      .run(
        "Primordial page",
        "One unstyled button at the root of the shared tree.",
        JSON.stringify(primordialDna),
        JSON.stringify(primordialMutation),
        sourceKey,
        pageKey,
        manifestKey,
        generationKey,
        hash,
        now,
        ROOT_REVISION_ID,
        SHARED_WORLD_ID,
      );
  })();
}

export class WorldResetConflict extends Error {
  constructor() {
    super("Wait for the active mutation to finish before resetting the world.");
    this.name = "WorldResetConflict";
  }
}

export async function resetSharedWorld() {
  const { sqlite } = getDatabase();

  sqlite.transaction(() => {
    const active = sqlite
      .prepare(
        `SELECT COUNT(*) AS count FROM mutation_jobs
         WHERE world_id = ? AND status IN ('reserved', 'running')`,
      )
      .get(SHARED_WORLD_ID) as { count: number };
    if (active.count > 0) throw new WorldResetConflict();

    sqlite
      .prepare(`DELETE FROM mutation_jobs WHERE world_id = ?`)
      .run(SHARED_WORLD_ID);
    sqlite
      .prepare(`DELETE FROM revisions WHERE world_id = ?`)
      .run(SHARED_WORLD_ID);
    sqlite.prepare(`DELETE FROM worlds WHERE id = ?`).run(SHARED_WORLD_ID);
  }).immediate();

  let storageCleared = true;
  try {
    await getObjectStorage().deletePrefix(`worlds/${SHARED_WORLD_ID}`);
  } catch (error) {
    storageCleared = false;
    logError("world.reset_storage_cleanup_failed", {
      worldId: SHARED_WORLD_ID,
      error: errorForLog(error),
    });
  }

  await ensureSharedWorld();
  return { storageCleared };
}
