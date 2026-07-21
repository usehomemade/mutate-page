import { NextResponse } from "next/server";

import { requestHasAllowedOrigin } from "@/lib/app-url";
import { actorHashForRequest } from "@/lib/identity";
import { getMutationJobForActor } from "@/lib/repository";

export const runtime = "nodejs";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!requestHasAllowedOrigin(request)) {
    return response(
      { error: { code: "BAD_ORIGIN", message: "Cross-origin status checks are not accepted." } },
      403,
    );
  }

  const { jobId } = await context.params;
  const job = getMutationJobForActor(jobId, actorHashForRequest(request));
  if (!job) {
    return response(
      { error: { code: "JOB_NOT_FOUND", message: "Mutation job not found." } },
      404,
    );
  }

  if (job.status === "completed") {
    return response({
      status: job.status,
      revisionId: job.revisionId,
      worldSlug: job.worldSlug,
    });
  }

  if (job.status === "failed") {
    return response({
      status: job.status,
      error: {
        code: job.failureCode || "MUTATION_FAILED",
        message: job.errorMessage || "The mutation failed.",
      },
    });
  }

  return response({ status: job.status });
}
