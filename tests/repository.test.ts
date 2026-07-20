import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mutate-page-db-"));

let repository: typeof import("@/lib/repository");
let database: typeof import("@/lib/db");
let worldModule: typeof import("@/lib/world");

beforeAll(async () => {
  process.env.DATABASE_PATH = path.join(testDirectory, "test.sqlite");
  process.env.LOCAL_OBJECT_STORAGE_PATH = path.join(testDirectory, "objects");
  process.env.MAX_CONCURRENT_GENERATIONS = "1";
  process.env.MUTATION_STALE_AFTER_SECONDS = "300";
  process.env.DAILY_OPENROUTER_BUDGET_USD = "1";
  process.env.OPENROUTER_COST_RESERVATION_USD = "0.1";

  repository = await import("@/lib/repository");
  database = await import("@/lib/db");
  worldModule = await import("@/lib/world");
  await worldModule.ensureSharedWorld();
});

afterAll(() => {
  database.getDatabase().sqlite.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

function reserve(actorHash: string) {
  const world = repository.getWorldById(worldModule.SHARED_WORLD_ID);
  const parent = repository.getReadyRevision(worldModule.ROOT_REVISION_ID);
  if (!world || !parent) throw new Error("Test world did not initialize.");

  return repository.reserveMutation({
    world,
    parent,
    actorHash,
    actionId: null,
    jobId: randomUUID(),
    childRevisionId: randomUUID(),
  });
}

describe("mutation reservation ledger", () => {
  it("reclaims an interrupted generation lease and conservatively accounts for it", () => {
    const first = reserve("actor-one");
    repository.markMutationRunning(first.jobId);

    const staleDate = new Date(Date.now() - 301_000).toISOString();
    database.getDatabase().sqlite
      .prepare("UPDATE mutation_jobs SET created_at = ? WHERE id = ?")
      .run(staleDate, first.jobId);

    const second = reserve("actor-two");
    const staleJob = database.getDatabase().sqlite
      .prepare(
        "SELECT status, failure_code AS failureCode, actual_cost_microusd AS cost, cost_is_estimate AS estimated FROM mutation_jobs WHERE id = ?",
      )
      .get(first.jobId) as {
      status: string;
      failureCode: string;
      cost: number;
      estimated: number;
    };
    const staleRevision = repository.getRevision(first.childRevisionId);

    expect(staleJob).toEqual({
      status: "failed",
      failureCode: "STALE_JOB",
      cost: first.reservedCostMicrousd,
      estimated: 1,
    });
    expect(staleRevision?.status).toBe("failed");
    expect(second.childRevisionId).toBeTruthy();

    repository.failMutation(second, {
      code: "TEST_CLEANUP",
      message: "Intentional test cleanup.",
    });
  });

  it("rejects work before inserting a revision when the daily reservation cannot fit", () => {
    process.env.DAILY_OPENROUTER_BUDGET_USD = "0.05";
    process.env.OPENROUTER_COST_RESERVATION_USD = "0.1";

    let caught: unknown;
    try {
      reserve("actor-budget");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(repository.MutationLimitError);
    expect((caught as InstanceType<typeof repository.MutationLimitError>).code)
      .toBe("DAILY_BUDGET_REACHED");
  });
});
