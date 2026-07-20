import { redirect } from "next/navigation";

import { getWorldById } from "@/lib/repository";
import { ensureSharedWorld, SHARED_WORLD_ID, ROOT_REVISION_ID } from "@/lib/world";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSharedWorld();
  const world = getWorldById(SHARED_WORLD_ID);
  redirect(`/w/shared/r/${world?.currentRevisionId || ROOT_REVISION_ID}`);
}
