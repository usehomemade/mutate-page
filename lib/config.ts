import "server-only";

import { resolveAppUrl } from "@/lib/app-url";

function numberFromEnv(name: string, fallback: number, minimum = 0) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a number greater than or equal to ${minimum}.`);
  }

  return value;
}

function integerFromEnv(name: string, fallback: number, minimum = 0) {
  return Math.floor(numberFromEnv(name, fallback, minimum));
}

function booleanFromEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${name} must be true or false.`);
}

function usdToMicros(value: number) {
  return Math.round(value * 1_000_000);
}

export function getAppConfig() {
  const appSecret =
    process.env.APP_SECRET || "development-only-secret-change-me";
  if (process.env.NODE_ENV === "production" && appSecret.length < 32) {
    throw new Error("APP_SECRET must contain at least 32 characters in production.");
  }

  return {
    appUrl: resolveAppUrl(),
    appSecret,
    databasePath: process.env.DATABASE_PATH || "./data/mutate.sqlite",
    localObjectStoragePath:
      process.env.LOCAL_OBJECT_STORAGE_PATH || "./data/objects",
    demoMode: booleanFromEnv("DEMO_MODE", false),
    maxPageBytes: integerFromEnv("MAX_PAGE_BYTES", 220_000, 10_000),
    maxParentHtmlCharacters: integerFromEnv(
      "MAX_PARENT_HTML_CHARACTERS",
      140_000,
      10_000,
    ),
    mutation: {
      cooldownSeconds: integerFromEnv("MUTATION_COOLDOWN_SECONDS", 10, 0),
      visitorDailyLimit: integerFromEnv(
        "VISITOR_DAILY_MUTATION_LIMIT",
        20,
        1,
      ),
      maxConcurrent: integerFromEnv("MAX_CONCURRENT_GENERATIONS", 2, 1),
      staleAfterSeconds: integerFromEnv(
        "MUTATION_STALE_AFTER_SECONDS",
        600,
        300,
      ),
    },
    budget: {
      dailyMicrousd: usdToMicros(
        numberFromEnv("DAILY_OPENROUTER_BUDGET_USD", 1, 0.01),
      ),
      reservationMicrousd: usdToMicros(
        numberFromEnv("OPENROUTER_COST_RESERVATION_USD", 0.1, 0.001),
      ),
    },
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY || "",
      model: process.env.OPENROUTER_MODEL || "qwen/qwen3-coder-next",
      macromutationModel:
        process.env.OPENROUTER_MACROMUTATION_MODEL ||
        "google/gemini-2.5-flash-lite",
      macromutationMaxOutputTokens: integerFromEnv(
        "OPENROUTER_MACROMUTATION_MAX_OUTPUT_TOKENS",
        120,
        32,
      ),
      macromutationTimeoutSeconds: integerFromEnv(
        "OPENROUTER_MACROMUTATION_TIMEOUT_SECONDS",
        8,
        2,
      ),
      briefModel:
        process.env.OPENROUTER_BRIEF_MODEL ||
        process.env.OPENROUTER_MACROMUTATION_MODEL ||
        "google/gemini-2.5-flash-lite",
      briefMaxOutputTokens: integerFromEnv(
        "OPENROUTER_BRIEF_MAX_OUTPUT_TOKENS",
        500,
        100,
      ),
      briefTimeoutSeconds: integerFromEnv(
        "OPENROUTER_BRIEF_TIMEOUT_SECONDS",
        10,
        2,
      ),
      temperature: numberFromEnv("OPENROUTER_TEMPERATURE", 0.9, 0),
      maxOutputTokens: integerFromEnv(
        "OPENROUTER_MAX_OUTPUT_TOKENS",
        6_000,
        1_000,
      ),
      timeoutSeconds: integerFromEnv("OPENROUTER_TIMEOUT_SECONDS", 45, 10),
      zdr: booleanFromEnv("OPENROUTER_ZDR", false),
      appName: process.env.OPENROUTER_APP_NAME || "Mutate Page",
    },
    r2: {
      accountId: process.env.R2_ACCOUNT_ID || "",
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      bucket: process.env.R2_BUCKET || "",
    },
  } as const;
}

export function formatMicrousd(micros: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: micros > 0 && micros < 10_000 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000);
}
