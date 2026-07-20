import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { WorldClient } from "@/components/world-client";
import {
  getLineage,
  getReadyRevision,
  getWorldBySlug,
  getWorldTree,
} from "@/lib/repository";
import { ensureSharedWorld, SHARED_WORLD_SLUG } from "@/lib/world";

export const dynamic = "force-dynamic";

type PageContext = {
  params: Promise<{ worldSlug: string; revisionId: string }>;
};

export async function generateMetadata(context: PageContext): Promise<Metadata> {
  await ensureSharedWorld();
  const { revisionId } = await context.params;
  const revision = getReadyRevision(revisionId);
  return { title: revision?.title || "Evolution not found" };
}

export default async function RevisionPage(context: PageContext) {
  await ensureSharedWorld();
  const { worldSlug, revisionId } = await context.params;
  if (worldSlug !== SHARED_WORLD_SLUG) notFound();

  const world = getWorldBySlug(worldSlug);
  if (!world) notFound();
  if (revisionId === "current") {
    redirect(`/w/${world.slug}/r/${world.currentRevisionId}`);
  }

  const revision = getReadyRevision(revisionId);
  if (!revision || revision.worldId !== world.id) notFound();

  const tree = getWorldTree(world.id);
  const lineage = getLineage(tree, revision.id);

  return (
    <WorldClient
      world={{ id: world.id, slug: world.slug, name: world.name }}
      revision={{
        id: revision.id,
        parentId: revision.parentId,
        depth: revision.depth,
        title: revision.title,
        summary: revision.summary,
        createdAt: revision.createdAt,
        mutationStrength: revision.mutationStrength,
      }}
      tree={tree}
      lineage={lineage}
      isWorldTip={world.currentRevisionId === revision.id}
    />
  );
}
