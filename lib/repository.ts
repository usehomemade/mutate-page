import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { getAppConfig } from "@/lib/config";
import { getDatabase } from "@/lib/db";
import {
  revisionActions,
  revisions,
  worlds,
  type Revision,
  type RevisionAction,
  type World,
} from "@/lib/db/schema";
import type {
  EvolutionaryAction,
  MutationDescription,
  PageDna,
} from "@/lib/mutation-schema";

export class MutationLimitError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DAILY_BUDGET_REACHED"
      | "VISITOR_DAILY_LIMIT"
      | "MUTATION_COOLDOWN"
      | "MAX_CONCURRENT_GENERATIONS",
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

export type MutationReservation = {
  jobId: string;
  childRevisionId: string;
  reservedCostMicrousd: number;
};

export type CompletedMutation = {
  title: string;
  summary: string;
  dna: PageDna;
  mutation: MutationDescription & { similarity: number };
  actions: EvolutionaryAction[];
  sourceKey: string;
  pageKey: string;
  manifestKey: string;
  generationKey: string;
  contentHash: string;
  model: string;
  temperature: number;
  mutationStrength: number;
  openrouterGenerationId: string | null;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  costMicrousd: number;
  costIsEstimate: boolean;
};

function utcDayWindow(date = new Date()) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function getWorldBySlug(slug: string) {
  return getDatabase().db.select().from(worlds).where(eq(worlds.slug, slug)).get();
}

export function getWorldById(id: string) {
  return getDatabase().db.select().from(worlds).where(eq(worlds.id, id)).get();
}

export function getRevision(id: string) {
  return getDatabase().db
    .select()
    .from(revisions)
    .where(eq(revisions.id, id))
    .get();
}

export function getReadyRevision(id: string) {
  return getDatabase().db
    .select()
    .from(revisions)
    .where(and(eq(revisions.id, id), eq(revisions.status, "ready")))
    .get();
}

export function getRevisionActions(revisionId: string) {
  return getDatabase().db
    .select()
    .from(revisionActions)
    .where(eq(revisionActions.revisionId, revisionId))
    .orderBy(asc(revisionActions.createdAt))
    .all();
}

export function getRevisionAction(revisionId: string, actionId: string) {
  return getDatabase().db
    .select()
    .from(revisionActions)
    .where(
      and(
        eq(revisionActions.revisionId, revisionId),
        eq(revisionActions.actionId, actionId),
      ),
    )
    .get();
}

export function reserveMutation(input: {
  world: World;
  parent: Revision;
  actorHash: string;
  actionId: string | null;
  jobId: string;
  childRevisionId: string;
}): MutationReservation {
  const { sqlite } = getDatabase();
  const config = getAppConfig();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBeforeIso = new Date(
    now.getTime() - config.mutation.staleAfterSeconds * 1_000,
  ).toISOString();
  const { start, end } = utcDayWindow(now);

  const transaction = sqlite.transaction(() => {
    const staleJobs = sqlite
      .prepare(
        `SELECT id, child_revision_id AS childRevisionId,
                reserved_cost_microusd AS reservedCostMicrousd
         FROM mutation_jobs
         WHERE status IN ('reserved', 'running') AND created_at < ?`,
      )
      .all(staleBeforeIso) as Array<{
      id: string;
      childRevisionId: string;
      reservedCostMicrousd: number;
    }>;

    const failStaleRevision = sqlite.prepare(
      `UPDATE revisions SET status = 'failed',
         error_message = 'Generation lease expired before completion.',
         cost_microusd = ?, cost_is_estimate = 1, completed_at = ?
       WHERE id = ? AND status = 'generating'`,
    );
    const failStaleJob = sqlite.prepare(
      `UPDATE mutation_jobs SET status = 'failed', failure_code = 'STALE_JOB',
         error_message = 'Generation lease expired before completion.',
         actual_cost_microusd = ?, cost_is_estimate = 1, completed_at = ?
       WHERE id = ? AND status IN ('reserved', 'running')`,
    );
    for (const stale of staleJobs) {
      failStaleRevision.run(
        stale.reservedCostMicrousd,
        nowIso,
        stale.childRevisionId,
      );
      failStaleJob.run(stale.reservedCostMicrousd, nowIso, stale.id);
    }

    const concurrent = sqlite
      .prepare(
        `SELECT COUNT(*) AS count
         FROM mutation_jobs
         WHERE status IN ('reserved', 'running')`,
      )
      .get() as { count: number };

    if (concurrent.count >= config.mutation.maxConcurrent) {
      throw new MutationLimitError(
        "The organism is already mutating. Try again shortly.",
        "MAX_CONCURRENT_GENERATIONS",
        10,
      );
    }

    const usage = sqlite
      .prepare(
        `SELECT COALESCE(SUM(
           CASE
             WHEN status IN ('reserved', 'running') THEN reserved_cost_microusd
             ELSE actual_cost_microusd
           END
         ), 0) AS committed
         FROM mutation_jobs
         WHERE created_at >= ? AND created_at < ?`,
      )
      .get(start, end) as { committed: number };

    if (
      usage.committed + config.budget.reservationMicrousd >
      config.budget.dailyMicrousd
    ) {
      const secondsUntilReset = Math.max(
        1,
        Math.ceil((new Date(end).getTime() - now.getTime()) / 1_000),
      );
      throw new MutationLimitError(
        "Today’s mutation budget has been used. Evolution resumes at 00:00 UTC.",
        "DAILY_BUDGET_REACHED",
        secondsUntilReset,
      );
    }

    const actorUsage = sqlite
      .prepare(
        `SELECT COUNT(*) AS count, MAX(created_at) AS latest
         FROM mutation_jobs
         WHERE actor_hash = ? AND created_at >= ? AND created_at < ?`,
      )
      .get(input.actorHash, start, end) as {
      count: number;
      latest: string | null;
    };

    if (actorUsage.count >= config.mutation.visitorDailyLimit) {
      throw new MutationLimitError(
        "You have reached today’s mutation limit. Other visitors can keep evolving this world.",
        "VISITOR_DAILY_LIMIT",
        Math.max(
          1,
          Math.ceil((new Date(end).getTime() - now.getTime()) / 1_000),
        ),
      );
    }

    if (actorUsage.latest && config.mutation.cooldownSeconds > 0) {
      const elapsed = (now.getTime() - new Date(actorUsage.latest).getTime()) / 1_000;
      if (elapsed < config.mutation.cooldownSeconds) {
        throw new MutationLimitError(
          "Give this mutation a moment to settle before creating another.",
          "MUTATION_COOLDOWN",
          Math.ceil(config.mutation.cooldownSeconds - elapsed),
        );
      }
    }

    const freshParent = sqlite
      .prepare(
        `SELECT id, status FROM revisions WHERE id = ? AND world_id = ?`,
      )
      .get(input.parent.id, input.world.id) as
      | { id: string; status: string }
      | undefined;
    if (!freshParent || freshParent.status !== "ready") {
      throw new Error("The parent revision is no longer available.");
    }

    sqlite
      .prepare(
        `INSERT INTO revisions (
          id, world_id, parent_id, depth, status, title, summary, dna_json,
          mutation_json, created_at
        ) VALUES (?, ?, ?, ?, 'generating', ?, ?, '{}', '{}', ?)`,
      )
      .run(
        input.childRevisionId,
        input.world.id,
        input.parent.id,
        input.parent.depth + 1,
        "Mutating…",
        "A new branch is being generated.",
        nowIso,
      );

    sqlite
      .prepare(
        `INSERT INTO mutation_jobs (
          id, world_id, parent_revision_id, child_revision_id, actor_hash,
          action_id, status, reserved_cost_microusd, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
      )
      .run(
        input.jobId,
        input.world.id,
        input.parent.id,
        input.childRevisionId,
        input.actorHash,
        input.actionId,
        config.budget.reservationMicrousd,
        nowIso,
      );

    return {
      jobId: input.jobId,
      childRevisionId: input.childRevisionId,
      reservedCostMicrousd: config.budget.reservationMicrousd,
    };
  });

  return transaction.immediate();
}

export function markMutationRunning(jobId: string) {
  const now = new Date().toISOString();
  getDatabase().sqlite
    .prepare(
      `UPDATE mutation_jobs
       SET status = 'running', started_at = ?
       WHERE id = ? AND status = 'reserved'`,
    )
    .run(now, jobId);
}

export function completeMutation(
  reservation: MutationReservation,
  worldId: string,
  result: CompletedMutation,
) {
  const { sqlite } = getDatabase();
  const now = new Date().toISOString();

  sqlite.transaction(() => {
    const revisionUpdate = sqlite
      .prepare(
        `UPDATE revisions SET
          status = 'ready', title = ?, summary = ?, dna_json = ?, mutation_json = ?,
          source_key = ?, page_key = ?, manifest_key = ?, generation_key = ?,
          content_hash = ?, model = ?, temperature = ?, mutation_strength = ?,
          openrouter_generation_id = ?, prompt_tokens = ?, completion_tokens = ?,
          reasoning_tokens = ?, cost_microusd = ?, cost_is_estimate = ?,
          completed_at = ?, error_message = NULL
        WHERE id = ? AND status = 'generating'`,
      )
      .run(
        result.title,
        result.summary,
        JSON.stringify(result.dna),
        JSON.stringify(result.mutation),
        result.sourceKey,
        result.pageKey,
        result.manifestKey,
        result.generationKey,
        result.contentHash,
        result.model,
        result.temperature,
        result.mutationStrength,
        result.openrouterGenerationId,
        result.promptTokens,
        result.completionTokens,
        result.reasoningTokens,
        result.costMicrousd,
        result.costIsEstimate ? 1 : 0,
        now,
        reservation.childRevisionId,
      );
    if (revisionUpdate.changes !== 1) {
      throw new Error("The mutation lease expired before it could be committed.");
    }

    const actionStatement = sqlite.prepare(
      `INSERT INTO revision_actions (
        revision_id, action_id, label, intent, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const action of result.actions) {
      actionStatement.run(
        reservation.childRevisionId,
        action.id,
        action.label,
        action.intent,
        now,
      );
    }

    sqlite
      .prepare(`UPDATE worlds SET current_revision_id = ? WHERE id = ?`)
      .run(reservation.childRevisionId, worldId);

    const jobUpdate = sqlite
      .prepare(
        `UPDATE mutation_jobs SET
          status = 'completed', actual_cost_microusd = ?, cost_is_estimate = ?,
          completed_at = ?
        WHERE id = ? AND status IN ('reserved', 'running')`,
      )
      .run(
        result.costMicrousd,
        result.costIsEstimate ? 1 : 0,
        now,
        reservation.jobId,
      );
    if (jobUpdate.changes !== 1) {
      throw new Error("The mutation job was no longer active at commit time.");
    }
  })();
}

export function failMutation(
  reservation: MutationReservation,
  input: {
    code: string;
    message: string;
    actualCostMicrousd?: number;
    costIsEstimate?: boolean;
    model?: string | null;
    openrouterGenerationId?: string | null;
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    mutationStrength?: number;
  },
) {
  const { sqlite } = getDatabase();
  const now = new Date().toISOString();
  const message = input.message.slice(0, 2_000);

  sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE revisions
         SET status = 'failed', error_message = ?, cost_microusd = ?,
             cost_is_estimate = ?, model = ?, openrouter_generation_id = ?,
             prompt_tokens = ?, completion_tokens = ?, reasoning_tokens = ?,
             mutation_strength = ?, completed_at = ?
         WHERE id = ?`,
      )
      .run(
        message,
        input.actualCostMicrousd || 0,
        input.costIsEstimate ? 1 : 0,
        input.model || null,
        input.openrouterGenerationId || null,
        input.promptTokens || 0,
        input.completionTokens || 0,
        input.reasoningTokens || 0,
        input.mutationStrength ?? null,
        now,
        reservation.childRevisionId,
      );
    sqlite
      .prepare(
        `UPDATE mutation_jobs
         SET status = 'failed', failure_code = ?, error_message = ?,
             actual_cost_microusd = ?, cost_is_estimate = ?, completed_at = ?
         WHERE id = ?`,
      )
      .run(
        input.code,
        message,
        input.actualCostMicrousd || 0,
        input.costIsEstimate ? 1 : 0,
        now,
        reservation.jobId,
      );
  })();
}

export type TreeRevision = Pick<
  Revision,
  | "id"
  | "parentId"
  | "depth"
  | "title"
  | "summary"
  | "createdAt"
  | "mutationStrength"
> & {
  children: string[];
};

export function getWorldTree(worldId: string): TreeRevision[] {
  const rows = getDatabase().db
    .select({
      id: revisions.id,
      parentId: revisions.parentId,
      depth: revisions.depth,
      title: revisions.title,
      summary: revisions.summary,
      createdAt: revisions.createdAt,
      mutationStrength: revisions.mutationStrength,
    })
    .from(revisions)
    .where(and(eq(revisions.worldId, worldId), eq(revisions.status, "ready")))
    .orderBy(asc(revisions.createdAt))
    .limit(1_000)
    .all();

  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    children.set(row.parentId, [...(children.get(row.parentId) || []), row.id]);
  }

  return rows.map((row) => ({
    ...row,
    children: children.get(row.id) || [],
  }));
}

export function getLineage(tree: TreeRevision[], revisionId: string) {
  const byId = new Map(tree.map((node) => [node.id, node]));
  const lineage: TreeRevision[] = [];
  let current = byId.get(revisionId);
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    lineage.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return lineage;
}

export function getBudgetSnapshot() {
  const { sqlite } = getDatabase();
  const config = getAppConfig();
  const { start, end } = utcDayWindow();
  const row = sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(actual_cost_microusd), 0) AS spent,
         COALESCE(SUM(CASE WHEN status IN ('reserved', 'running')
           THEN reserved_cost_microusd ELSE 0 END), 0) AS reserved,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM mutation_jobs
       WHERE created_at >= ? AND created_at < ?`,
    )
    .get(start, end) as {
    spent: number;
    reserved: number;
    completed: number;
    failed: number;
  };

  return {
    ...row,
    limit: config.budget.dailyMicrousd,
    remaining: Math.max(0, config.budget.dailyMicrousd - row.spent - row.reserved),
    resetsAt: end,
  };
}

export function getAdminStats() {
  const { sqlite } = getDatabase();
  const budget = getBudgetSnapshot();
  const daily = sqlite
    .prepare(
      `WITH RECURSIVE dates(day) AS (
         SELECT date('now', '-13 days')
         UNION ALL
         SELECT date(day, '+1 day') FROM dates WHERE day < date('now')
       )
       SELECT
         dates.day,
         COALESCE(jobs.spend, 0) AS spend,
         COALESCE(jobs.completed, 0) AS completed,
         COALESCE(jobs.failed, 0) AS failed,
         COALESCE(pages.pages, 0) AS pages
       FROM dates
       LEFT JOIN (
         SELECT date(created_at) AS day,
           SUM(actual_cost_microusd) AS spend,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM mutation_jobs GROUP BY date(created_at)
       ) jobs ON jobs.day = dates.day
       LEFT JOIN (
         SELECT date(completed_at) AS day, COUNT(*) AS pages
         FROM revisions
         WHERE status = 'ready' AND parent_id IS NOT NULL
         GROUP BY date(completed_at)
       ) pages ON pages.day = dates.day
       ORDER BY dates.day ASC`,
    )
    .all() as Array<{
    day: string;
    spend: number;
    completed: number;
    failed: number;
    pages: number;
  }>;

  const totals = sqlite
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS pages,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_pages,
         MAX(depth) AS max_depth
       FROM revisions`,
    )
    .get() as { pages: number; failed_pages: number; max_depth: number };

  const branches = sqlite
    .prepare(
      `SELECT COUNT(*) AS count FROM (
         SELECT parent_id FROM revisions
         WHERE status = 'ready' AND parent_id IS NOT NULL
         GROUP BY parent_id HAVING COUNT(*) > 1
       )`,
    )
    .get() as { count: number };

  const recent = sqlite
    .prepare(
      `SELECT
         j.id, j.status, j.action_id AS actionId,
         j.actual_cost_microusd AS costMicrousd,
         j.cost_is_estimate AS costIsEstimate,
         j.failure_code AS failureCode, j.created_at AS createdAt,
         j.completed_at AS completedAt,
         r.id AS revisionId, r.title, r.model,
         r.prompt_tokens AS promptTokens,
         r.completion_tokens AS completionTokens,
         r.reasoning_tokens AS reasoningTokens
       FROM mutation_jobs j
       JOIN revisions r ON r.id = j.child_revision_id
       ORDER BY j.created_at DESC LIMIT 30`,
    )
    .all() as Array<{
    id: string;
    status: string;
    actionId: string | null;
    costMicrousd: number;
    costIsEstimate: number;
    failureCode: string | null;
    createdAt: string;
    completedAt: string | null;
    revisionId: string;
    title: string;
    model: string | null;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
  }>;

  return { budget, daily, totals, branches: branches.count, recent };
}

export function listRecentActions(): RevisionAction[] {
  return getDatabase().db
    .select()
    .from(revisionActions)
    .orderBy(desc(revisionActions.createdAt))
    .limit(30)
    .all();
}
