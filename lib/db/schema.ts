import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  rootRevisionId: text("root_revision_id"),
  currentRevisionId: text("current_revision_id"),
  createdAt: text("created_at").notNull(),
});

export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    depth: integer("depth").notNull(),
    status: text("status", {
      enum: ["generating", "ready", "failed"],
    }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    dnaJson: text("dna_json").notNull(),
    mutationJson: text("mutation_json").notNull(),
    sourceKey: text("source_key"),
    pageKey: text("page_key"),
    manifestKey: text("manifest_key"),
    generationKey: text("generation_key"),
    contentHash: text("content_hash"),
    model: text("model"),
    temperature: real("temperature"),
    mutationStrength: real("mutation_strength"),
    openrouterGenerationId: text("openrouter_generation_id"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    costMicrousd: integer("cost_microusd").notNull().default(0),
    costIsEstimate: integer("cost_is_estimate", { mode: "boolean" })
      .notNull()
      .default(false),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("revisions_world_created_idx").on(table.worldId, table.createdAt),
    index("revisions_parent_idx").on(table.parentId),
    index("revisions_status_idx").on(table.status),
  ],
);

export const revisionActions = sqliteTable(
  "revision_actions",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => revisions.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    label: text("label").notNull(),
    intent: text("intent").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.revisionId, table.actionId] })],
);

export const mutationJobs = sqliteTable(
  "mutation_jobs",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    parentRevisionId: text("parent_revision_id")
      .notNull()
      .references(() => revisions.id),
    childRevisionId: text("child_revision_id")
      .notNull()
      .references(() => revisions.id),
    actorHash: text("actor_hash").notNull(),
    actionId: text("action_id"),
    status: text("status", {
      enum: ["reserved", "running", "completed", "failed"],
    }).notNull(),
    reservedCostMicrousd: integer("reserved_cost_microusd").notNull(),
    actualCostMicrousd: integer("actual_cost_microusd").notNull().default(0),
    costIsEstimate: integer("cost_is_estimate", { mode: "boolean" })
      .notNull()
      .default(false),
    failureCode: text("failure_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("mutation_jobs_created_idx").on(table.createdAt),
    index("mutation_jobs_actor_created_idx").on(
      table.actorHash,
      table.createdAt,
    ),
    index("mutation_jobs_status_idx").on(table.status),
  ],
);

export type World = typeof worlds.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
export type RevisionAction = typeof revisionActions.$inferSelect;
export type MutationJob = typeof mutationJobs.$inferSelect;

