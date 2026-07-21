import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requestHasAllowedOrigin } from "@/lib/app-url";
import { actorHashForRequest } from "@/lib/identity";
import { errorForLog, logError, logInfo, logWarn } from "@/lib/log";
import { mutatePage } from "@/lib/mutation-service";
import {
  getReadyRevision,
  getWorldById,
  MutationLimitError,
} from "@/lib/repository";
import { ensureSharedWorld, SHARED_WORLD_ID } from "@/lib/world";

export const runtime = "nodejs";
export const maxDuration = 300;

const mutationRequestSchema = z
  .object({
    requestId: z.string().uuid().optional(),
    parentRevisionId: z.string().min(1).max(100),
    clickedText: z.string().min(1).max(200).nullable().optional(),
    clickedTag: z.string().min(1).max(20).nullable().optional(),
  })
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
    logWarn("mutation.rejected", {
      requestId,
      reason: "bad_origin",
      origin: request.headers.get("origin"),
    });
    return jsonError("Cross-origin mutations are not accepted.", 403, "BAD_ORIGIN");
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    logWarn("mutation.rejected", { requestId, reason: "invalid_json" });
    return jsonError("The request body must be JSON.", 400, "INVALID_JSON");
  }

  const parsed = mutationRequestSchema.safeParse(input);
  if (!parsed.success) {
    logWarn("mutation.rejected", { requestId, reason: "invalid_request" });
    return jsonError("The mutation request is invalid.", 400, "INVALID_REQUEST");
  }

  try {
    const mutationId = parsed.data.requestId || randomUUID();
    logInfo("mutation.requested", {
      requestId,
      mutationId,
      parentRevisionId: parsed.data.parentRevisionId,
      clickedText: parsed.data.clickedText || null,
    });
    await ensureSharedWorld();
    const parent = getReadyRevision(parsed.data.parentRevisionId);
    if (!parent || parent.worldId !== SHARED_WORLD_ID) {
      logWarn("mutation.rejected", {
        requestId,
        reason: "parent_not_found",
        parentRevisionId: parsed.data.parentRevisionId,
      });
      return jsonError("That ancestor does not exist.", 404, "PARENT_NOT_FOUND");
    }

    const world = getWorldById(parent.worldId);
    if (!world) {
      logError("mutation.rejected", {
        requestId,
        reason: "world_unavailable",
        worldId: parent.worldId,
      });
      return jsonError("The shared world is unavailable.", 503, "WORLD_UNAVAILABLE");
    }

    const clickedText = parsed.data.clickedText || null;
    const click = clickedText
      ? { text: clickedText, tag: parsed.data.clickedTag || "a" }
      : null;

    const result = await mutatePage({
      requestId,
      jobId: mutationId,
      world,
      parent,
      click,
      actorHash: actorHashForRequest(request),
    });

    logInfo("mutation.responded", {
      requestId,
      revisionId: result.revisionId,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof MutationLimitError) {
      logWarn("mutation.limited", {
        requestId,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }

    logError("mutation.request_failed", {
      requestId,
      durationMs: Date.now() - startedAt,
      error: errorForLog(error),
    });
    return jsonError(
      "This mutation did not survive. The ancestor is unchanged, so you can try again.",
      502,
      "MUTATION_FAILED",
    );
  }
}
