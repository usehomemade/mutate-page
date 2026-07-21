import "server-only";

import { z } from "zod";

import { getAppConfig } from "@/lib/config";
import { getDatabase } from "@/lib/db";

export type RuntimeLimits = {
  dailyBudgetUsd: number;
  costReservationUsd: number;
  maxConcurrent: number;
  staleAfterSeconds: number;
  visitorDailyLimit: number;
  cooldownSeconds: number;
};

export const runtimeLimitsSchema = z.object({
  dailyBudgetUsd: z.number().finite().min(0.01).max(10_000),
  costReservationUsd: z.number().finite().min(0.001).max(1_000),
  maxConcurrent: z.number().int().min(1).max(50),
  staleAfterSeconds: z.number().int().min(60).max(3_600),
  visitorDailyLimit: z.number().int().min(1).max(10_000),
  cooldownSeconds: z.number().int().min(0).max(3_600),
});

const KEYS: Record<keyof RuntimeLimits, string> = {
  dailyBudgetUsd: "daily_budget_usd",
  costReservationUsd: "cost_reservation_usd",
  maxConcurrent: "max_concurrent",
  staleAfterSeconds: "stale_after_seconds",
  visitorDailyLimit: "visitor_daily_limit",
  cooldownSeconds: "cooldown_seconds",
};

/** The values baked into .env — used as defaults until an admin overrides them. */
export function defaultRuntimeLimits(): RuntimeLimits {
  const config = getAppConfig();
  return {
    dailyBudgetUsd: config.budget.dailyMicrousd / 1_000_000,
    costReservationUsd: config.budget.reservationMicrousd / 1_000_000,
    maxConcurrent: config.mutation.maxConcurrent,
    staleAfterSeconds: config.mutation.staleAfterSeconds,
    visitorDailyLimit: config.mutation.visitorDailyLimit,
    cooldownSeconds: config.mutation.cooldownSeconds,
  };
}

/** The limits actually in effect right now: DB overrides layered on top of the .env defaults. */
export function getRuntimeLimits(): RuntimeLimits {
  const { sqlite } = getDatabase();
  const rows = sqlite
    .prepare("SELECT key, value FROM settings")
    .all() as Array<{ key: string; value: string }>;
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const result = defaultRuntimeLimits();
  for (const field of Object.keys(KEYS) as Array<keyof RuntimeLimits>) {
    const raw = stored.get(KEYS[field]);
    if (raw === undefined) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) result[field] = value;
  }
  return result;
}

export function isRuntimeLimitsOverridden(): boolean {
  const { sqlite } = getDatabase();
  const row = sqlite
    .prepare("SELECT COUNT(*) AS count FROM settings")
    .get() as { count: number };
  return row.count > 0;
}

export function updateRuntimeLimits(partial: Partial<RuntimeLimits>): RuntimeLimits {
  const { sqlite } = getDatabase();
  const now = new Date().toISOString();
  const upsert = sqlite.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );

  sqlite.transaction(() => {
    for (const field of Object.keys(partial) as Array<keyof RuntimeLimits>) {
      const value = partial[field];
      if (value === undefined) continue;
      upsert.run(KEYS[field], String(value), now);
    }
  })();

  return getRuntimeLimits();
}

/** Reverts every overridden limit back to its .env default. */
export function resetRuntimeLimits(): RuntimeLimits {
  const { sqlite } = getDatabase();
  sqlite.prepare("DELETE FROM settings").run();
  return getRuntimeLimits();
}
