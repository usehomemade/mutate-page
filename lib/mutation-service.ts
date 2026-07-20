import "server-only";

import { randomInt, randomUUID } from "node:crypto";

import { getAppConfig } from "@/lib/config";
import type { Revision, RevisionAction, World } from "@/lib/db/schema";
import {
  generatePage,
  PageGenerationFailure,
  type GenerationAccounting,
  type PageGeneration,
} from "@/lib/openrouter";
import {
  completeMutation,
  failMutation,
  markMutationRunning,
  reserveMutation,
} from "@/lib/repository";
import {
  buildSandboxDocument,
  cleanGeneratedDocument,
  contentHash,
  measureDocumentSimilarity,
  validateGeneratedDocument,
} from "@/lib/sandbox";
import { getObjectStorage } from "@/lib/storage";

function randomUnit() {
  return randomInt(0, 1_000_000) / 1_000_000;
}

export function sampleMutationStrength(hasSelectionPressure: boolean) {
  const value = randomUnit();
  if (hasSelectionPressure) return 0.32 + value * 0.36;
  if (value < 0.7) return 0.07 + randomUnit() * 0.16;
  if (value < 0.95) return 0.24 + randomUnit() * 0.24;
  return 0.55 + randomUnit() * 0.3;
}

export async function mutatePage(input: {
  world: World;
  parent: Revision;
  action: RevisionAction | null;
  actorHash: string;
}) {
  if (!input.parent.sourceKey) {
    throw new Error("The parent revision has no source snapshot.");
  }

  const config = getAppConfig();
  const storage = getObjectStorage();
  const childRevisionId = randomUUID();
  const jobId = randomUUID();
  const mutationStrength = sampleMutationStrength(Boolean(input.action));
  const reservation = reserveMutation({
    world: input.world,
    parent: input.parent,
    actorHash: input.actorHash,
    actionId: input.action?.actionId || null,
    jobId,
    childRevisionId,
  });

  let generation: PageGeneration | null = null;
  try {
    markMutationRunning(jobId);
    const parentSource = await storage.getText(input.parent.sourceKey);
    generation = await generatePage({
      parent: input.parent,
      parentSource,
      action: input.action,
      mutationStrength,
    });

    const source = cleanGeneratedDocument(generation.page.html);
    validateGeneratedDocument(
      source,
      generation.page.actions,
      config.maxPageBytes,
    );
    const similarity = measureDocumentSimilarity(parentSource, source);
    if (
      input.parent.depth > 0 &&
      mutationStrength < 0.2 &&
      similarity < 0.08
    ) {
      throw new Error(
        "A subtle mutation diverged too far from its ancestor and was rejected.",
      );
    }

    const page = buildSandboxDocument(
      source,
      childRevisionId,
      generation.page.actions,
    );
    const hash = contentHash(source);
    const prefix = `worlds/${input.world.id}/revisions/${childRevisionId}`;
    const sourceKey = `${prefix}/source.html`;
    const pageKey = `${prefix}/page.html`;
    const manifestKey = `${prefix}/manifest.json`;
    const generationKey = `${prefix}/generation.json`;
    const createdAt = new Date().toISOString();
    const costIsEstimate = !generation.usage.costIsKnown;
    const costMicrousd = generation.usage.costIsKnown
      ? generation.usage.costMicrousd
      : reservation.reservedCostMicrousd;

    const manifest = {
      schemaVersion: 1,
      worldId: input.world.id,
      revisionId: childRevisionId,
      parentRevisionId: input.parent.id,
      sourceActionId: input.action?.actionId || null,
      depth: input.parent.depth + 1,
      title: generation.page.title,
      summary: generation.page.summary,
      dna: generation.page.dna,
      mutation: { ...generation.page.mutation, similarity },
      actions: generation.page.actions,
      contentHash: hash,
      createdAt,
    };
    const generationMetadata = {
      schemaVersion: 1,
      openrouterGenerationId: generation.generationId,
      model: generation.model,
      temperature: config.openRouter.temperature,
      mutationStrength,
      promptTokens: generation.usage.promptTokens,
      completionTokens: generation.usage.completionTokens,
      reasoningTokens: generation.usage.reasoningTokens,
      costMicrousd,
      costIsEstimate,
      demoMode: config.demoMode,
    };

    await Promise.all([
      storage.put(sourceKey, source, {
        contentType: "text/html; charset=utf-8",
        cacheControl: "public, max-age=31536000, immutable",
      }),
      storage.put(pageKey, page, {
        contentType: "text/html; charset=utf-8",
        cacheControl: "public, max-age=31536000, immutable",
      }),
      storage.put(manifestKey, JSON.stringify(manifest, null, 2), {
        contentType: "application/json",
        cacheControl: "public, max-age=31536000, immutable",
      }),
      storage.put(
        generationKey,
        JSON.stringify(generationMetadata, null, 2),
        {
          contentType: "application/json",
          cacheControl: "public, max-age=31536000, immutable",
        },
      ),
    ]);

    completeMutation(reservation, input.world.id, {
      title: generation.page.title,
      summary: generation.page.summary,
      dna: generation.page.dna,
      mutation: { ...generation.page.mutation, similarity },
      actions: generation.page.actions,
      sourceKey,
      pageKey,
      manifestKey,
      generationKey,
      contentHash: hash,
      model: generation.model,
      temperature: config.openRouter.temperature,
      mutationStrength,
      openrouterGenerationId: generation.generationId,
      promptTokens: generation.usage.promptTokens,
      completionTokens: generation.usage.completionTokens,
      reasoningTokens: generation.usage.reasoningTokens,
      costMicrousd,
      costIsEstimate,
    });

    return {
      revisionId: childRevisionId,
      worldSlug: input.world.slug,
      title: generation.page.title,
      summary: generation.page.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed.";
    const accounting: GenerationAccounting | null =
      generation ||
      (error instanceof PageGenerationFailure ? error.accounting : null);
    const costIsKnown = accounting?.usage.costIsKnown || false;
    failMutation(reservation, {
      code: error instanceof Error ? error.name || "MUTATION_FAILED" : "MUTATION_FAILED",
      message,
      actualCostMicrousd: accounting
        ? costIsKnown
          ? accounting.usage.costMicrousd
          : reservation.reservedCostMicrousd
        : 0,
      costIsEstimate: Boolean(accounting && !costIsKnown),
      model: accounting?.model,
      openrouterGenerationId: accounting?.generationId,
      promptTokens: accounting?.usage.promptTokens,
      completionTokens: accounting?.usage.completionTokens,
      reasoningTokens: accounting?.usage.reasoningTokens,
      mutationStrength,
    });
    throw error;
  }
}
