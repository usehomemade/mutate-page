import "server-only";

import { createHmac } from "node:crypto";

import { getAppConfig } from "@/lib/config";

export function actorHashForRequest(request: Request) {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address =
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    forwarded ||
    "unknown";
  const userAgent = headers.get("user-agent") || "unknown-agent";

  return createHmac("sha256", getAppConfig().appSecret)
    .update(`${address}\n${userAgent}`)
    .digest("hex");
}

