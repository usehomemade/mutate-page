import { NextResponse } from "next/server";
import { z } from "zod";

import { actorHashForRequest } from "@/lib/identity";
import { mutatePage } from "@/lib/mutation-service";
import {
  getReadyRevision,
  getRevisionAction,
  getWorldById,
  MutationLimitError,
} from "@/lib/repository";
import { ensureSharedWorld, SHARED_WORLD_ID } from "@/lib/world";

export const runtime = "nodejs";
export const maxDuration = 300;

const mutationRequestSchema = z
  .object({
    parentRevisionId: z.string().min(1).max(100),
    actionId: z.string().min(1).max(120).nullable().optional(),
  })
  .strict();

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return jsonError("Cross-origin mutations are not accepted.", 403, "BAD_ORIGIN");
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400, "INVALID_JSON");
  }

  const parsed = mutationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return jsonError("The mutation request is invalid.", 400, "INVALID_REQUEST");
  }

  try {
    await ensureSharedWorld();
    const parent = getReadyRevision(parsed.data.parentRevisionId);
    if (!parent || parent.worldId !== SHARED_WORLD_ID) {
      return jsonError("That ancestor does not exist.", 404, "PARENT_NOT_FOUND");
    }

    const world = getWorldById(parent.worldId);
    if (!world) {
      return jsonError("The shared world is unavailable.", 503, "WORLD_UNAVAILABLE");
    }

    const requestedActionId = parsed.data.actionId || null;
    const action = requestedActionId
      ? (getRevisionAction(parent.id, requestedActionId) ?? null)
      : null;
    if (requestedActionId && !action) {
      return jsonError(
        "That evolutionary link does not belong to this page.",
        400,
        "ACTION_NOT_FOUND",
      );
    }

    const result = await mutatePage({
      world,
      parent,
      action,
      actorHash: actorHashForRequest(request),
    });

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof MutationLimitError) {
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

    console.error("Mutation failed", error);
    return jsonError(
      "This mutation did not survive. The ancestor is unchanged, so you can try again.",
      502,
      "MUTATION_FAILED",
    );
  }
}
