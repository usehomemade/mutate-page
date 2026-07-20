import { NextResponse } from "next/server";

import { getReadyRevision } from "@/lib/repository";
import { getObjectStorage } from "@/lib/storage";
import { ensureSharedWorld, SHARED_WORLD_ID } from "@/lib/world";

export const runtime = "nodejs";

const documentPolicy = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "navigate-to 'none'",
  "frame-ancestors 'self'",
].join("; ");

export async function GET(
  _request: Request,
  context: { params: Promise<{ revisionId: string }> },
) {
  await ensureSharedWorld();
  const { revisionId } = await context.params;
  const revision = getReadyRevision(revisionId);

  if (!revision || revision.worldId !== SHARED_WORLD_ID || !revision.pageKey) {
    return new NextResponse("Revision not found.", { status: 404 });
  }

  try {
    const document = await getObjectStorage().getText(revision.pageKey);
    return new NextResponse(document, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": documentPolicy,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(`Could not read revision ${revisionId}`, error);
    return new NextResponse("Revision snapshot unavailable.", { status: 503 });
  }
}
