import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requestHasAllowedOrigin } from "@/lib/app-url";
import { errorForLog, logError, logInfo, logWarn } from "@/lib/log";
import { resetSharedWorld, WorldResetConflict } from "@/lib/world";

export const runtime = "nodejs";

const resetRequestSchema = z
  .object({ confirmation: z.literal("reset-shared-world") })
  .strict();

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();

  if (!requestHasAllowedOrigin(request)) {
    logWarn("world.reset_rejected", {
      requestId,
      reason: "bad_origin",
      origin: request.headers.get("origin"),
    });
    return jsonError("Cross-origin resets are not accepted.", 403, "BAD_ORIGIN");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logWarn("world.reset_rejected", { requestId, reason: "invalid_json" });
    return jsonError("The reset request must be JSON.", 400, "INVALID_JSON");
  }

  if (!resetRequestSchema.safeParse(body).success) {
    logWarn("world.reset_rejected", {
      requestId,
      reason: "invalid_confirmation",
    });
    return jsonError("Reset confirmation is invalid.", 400, "INVALID_CONFIRMATION");
  }

  try {
    logInfo("world.reset_requested", { requestId });
    const result = await resetSharedWorld();
    logInfo("world.reset_completed", {
      requestId,
      storageCleared: result.storageCleared,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof WorldResetConflict) {
      logWarn("world.reset_blocked", {
        requestId,
        reason: "active_mutation",
      });
      return jsonError(error.message, 409, "ACTIVE_MUTATION");
    }

    logError("world.reset_failed", {
      requestId,
      durationMs: Date.now() - startedAt,
      error: errorForLog(error),
    });
    return jsonError("The shared world could not be reset.", 500, "RESET_FAILED");
  }
}
