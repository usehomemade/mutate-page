import "server-only";

import fs from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { getAppConfig } from "@/lib/config";
import * as schema from "@/lib/db/schema";

type DatabaseBundle = {
  sqlite: BetterSqlite3.Database;
  db: BetterSQLite3Database<typeof schema>;
};

const globalForDatabase = globalThis as typeof globalThis & {
  mutateDatabase?: DatabaseBundle;
};

const migrationSql = `
  CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    root_revision_id TEXT,
    current_revision_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS revisions (
    id TEXT PRIMARY KEY NOT NULL,
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES revisions(id),
    depth INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('generating', 'ready', 'failed')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    dna_json TEXT NOT NULL,
    mutation_json TEXT NOT NULL,
    source_key TEXT,
    page_key TEXT,
    manifest_key TEXT,
    generation_key TEXT,
    content_hash TEXT,
    model TEXT,
    scope TEXT,
    duration_ms INTEGER,
    temperature REAL,
    mutation_strength REAL,
    openrouter_generation_id TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    cost_microusd INTEGER NOT NULL DEFAULT 0,
    cost_is_estimate INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS revisions_world_created_idx
    ON revisions(world_id, created_at);
  CREATE INDEX IF NOT EXISTS revisions_parent_idx ON revisions(parent_id);
  CREATE INDEX IF NOT EXISTS revisions_status_idx ON revisions(status);

  CREATE TABLE IF NOT EXISTS mutation_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    parent_revision_id TEXT NOT NULL REFERENCES revisions(id),
    child_revision_id TEXT NOT NULL REFERENCES revisions(id),
    actor_hash TEXT NOT NULL,
    clicked_text TEXT,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'running', 'completed', 'failed')),
    reserved_cost_microusd INTEGER NOT NULL,
    actual_cost_microusd INTEGER NOT NULL DEFAULT 0,
    cost_is_estimate INTEGER NOT NULL DEFAULT 0,
    failure_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS mutation_jobs_created_idx
    ON mutation_jobs(created_at);
  CREATE INDEX IF NOT EXISTS mutation_jobs_actor_created_idx
    ON mutation_jobs(actor_hash, created_at);
  CREATE INDEX IF NOT EXISTS mutation_jobs_status_idx
    ON mutation_jobs(status);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

function createDatabase(): DatabaseBundle {
  const { databasePath } = getAppConfig();
  const absolutePath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  const sqlite = new BetterSqlite3(absolutePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(migrationSql);

  try {
    sqlite.exec("ALTER TABLE revisions ADD COLUMN scope TEXT");
  } catch {
    // Column already exists on databases created after this migration.
  }

  try {
    sqlite.exec("ALTER TABLE revisions ADD COLUMN duration_ms INTEGER");
  } catch {
    // Column already exists on databases created after this migration.
  }

  try {
    sqlite.exec(
      "ALTER TABLE mutation_jobs RENAME COLUMN action_id TO clicked_text",
    );
  } catch {
    // Already renamed, or the column never existed on a fresh database.
  }

  try {
    sqlite.exec("DROP TABLE IF EXISTS revision_actions");
  } catch {
    // Already dropped.
  }

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
}

export function getDatabase() {
  if (!globalForDatabase.mutateDatabase) {
    globalForDatabase.mutateDatabase = createDatabase();
  }

  return globalForDatabase.mutateDatabase;
}

