import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requestHasAllowedOrigin } from "@/lib/app-url";
import { errorForLog, logError, logInfo, logWarn } from "@/lib/log";
import {
  getRuntimeLimits,
  resetRuntimeLimits,
  runtimeLimitsSchema,
  updateRuntimeLimits,
} from "@/lib/settings";

export const runtime = "nodejs";

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const requestId = randomUUID();

  if (!requestHasAllowedOrigin(request)) {
    logWarn("settings.rejected", {
      requestId,
      reason: "bad_origin",
      origin: request.headers.get("origin"),
    });
    return jsonError("Cross-origin requests are not accepted.", 403, "BAD_ORIGIN");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logWarn("settings.rejected", { requestId, reason: "invalid_json" });
    return jsonError("The request body must be JSON.", 400, "INVALID_JSON");
  }

  const parsed = runtimeLimitsSchema.safeParse(body);
  if (!parsed.success) {
    logWarn("settings.rejected", {
      requestId,
      reason: "invalid_limits",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
    return jsonError(
      parsed.error.issues[0]?.message || "The submitted limits are invalid.",
      400,
      "INVALID_LIMITS",
    );
  }

  try {
    const limits = updateRuntimeLimits(parsed.data);
    logInfo("settings.updated", { requestId, limits });
    return NextResponse.json({ ok: true, limits }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("settings.update_failed", { requestId, error: errorForLog(error) });
    return jsonError("The limits could not be saved.", 500, "UPDATE_FAILED");
  }
}

export async function DELETE(request: Request) {
  const requestId = randomUUID();

  if (!requestHasAllowedOrigin(request)) {
    logWarn("settings.rejected", {
      requestId,
      reason: "bad_origin",
      origin: request.headers.get("origin"),
    });
    return jsonError("Cross-origin requests are not accepted.", 403, "BAD_ORIGIN");
  }

  try {
    const limits = resetRuntimeLimits();
    logInfo("settings.reset", { requestId, limits });
    return NextResponse.json({ ok: true, limits }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("settings.reset_failed", { requestId, error: errorForLog(error) });
    return jsonError("The limits could not be reset.", 500, "RESET_FAILED");
  }
}

export async function GET() {
  return NextResponse.json(
    { limits: getRuntimeLimits() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
