import { NextResponse } from "next/server";

import { getAppConfig } from "@/lib/config";
import { getDatabase } from "@/lib/db";
import { getObjectStorage } from "@/lib/storage";

export const runtime = "nodejs";

export function GET() {
  try {
    getDatabase().sqlite.prepare("SELECT 1").get();
    const config = getAppConfig();
    return NextResponse.json({
      ok: true,
      database: "sqlite",
      objectStorage: getObjectStorage().mode,
      generator: config.demoMode ? "demo" : "openrouter",
      model: config.openRouter.model,
    });
  } catch (error) {
    console.error("Health check failed", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
