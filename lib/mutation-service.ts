import "server-only";

import { randomInt, randomUUID } from "node:crypto";

import { getAppConfig } from "@/lib/config";
import type { Revision, World } from "@/lib/db/schema";
import {
  MACROMUTATION_PROBABILITY,
  shouldTriggerMacromutation,
} from "@/lib/macromutation";
import { errorForLog, logError, logInfo, logWarn } from "@/lib/log";
import {
  generateContentBrief,
  generateMacromutationDirective,
  generatePagePatch,
  PageGenerationFailure,
  type ClickSignal,
  type ContentBriefGeneration,
  type GenerationAccounting,
  type MacromutationGeneration,
  type PagePatchGeneration,
} from "@/lib/openrouter";
import type {
  ContentBrief,
  MutationDescription,
  PageDna,
  PatchRegion,
  PatchScopeMode,
} from "@/lib/mutation-schema";
import {
  completeMutation,
  failMutation,
  markMutationRunning,
  reserveMutation,
} from "@/lib/repository";
import {
  annotateRegions,
  appendAssetsToSource,
  buildSandboxDocument,
  cleanGeneratedDocument,
  contentHash,
  findRegionIdForClickedText,
  measureDocumentSimilarity,
  spliceRegions,
  stripRegionMarkers,
  validateGeneratedDocument,
} from "@/lib/sandbox";
import { getObjectStorage } from "@/lib/storage";

function randomUnit() {
  return randomInt(0, 1_000_000) / 1_000_000;
}

export function sampleMutationStrength(hasSelectionPressure: boolean) {
  const value = randomUnit();
  if (hasSelectionPressure) return 0.35 + value * 0.45;
  if (value < 0.5) return 0.07 + randomUnit() * 0.18;
  if (value < 0.85) return 0.25 + randomUnit() * 0.35;
  return 0.6 + randomUnit() * 0.35;
}

// A genre-changing scope="full" mutation is deliberately rare: real evolution
// is mostly slow, same-genre drift. This is decided programmatically (not
// left to the model's judgment) so the frequency can be tuned directly here,
// independent of anything the prompt says.
export const FULL_SCOPE_PROBABILITY = 0.12;

export function sampleScopeMode(input: {
  isPrimordial: boolean;
  macromutationSelected: boolean;
}): PatchScopeMode {
  if (input.isPrimordial) return "full-only";
  if (input.macromutationSelected) return "full-optional";
  return randomUnit() < FULL_SCOPE_PROBABILITY ? "full-optional" : "region-only";
}

/**
 * Used only if the content-brief step itself fails (e.g. the brief model is
 * down). The page generator still needs some brief to implement, so this
 * degrades to a plain continuation rather than failing the whole mutation.
 */
function fallbackContentBrief(input: {
  parent: Revision;
  click: ClickSignal;
}): ContentBrief {
  const subject = input.click?.text || input.parent.title;
  return {
    subject,
    genre: "a continuation of the current page",
    tone: "confident and clear",
    keyContent: [`Continue developing ${subject}.`],
    visualDirection: "Stay visually consistent with the current page.",
    interactionIdeas: [],
  };
}

function aggregateAccounting(
  values: Array<GenerationAccounting | null>,
  estimatedCostMicrousd: number,
) {
  const accounting = values.filter(
    (value): value is GenerationAccounting => value !== null,
  );
  const costIsKnown =
    accounting.length > 0 && accounting.every((value) => value.usage.costIsKnown);

  return {
    promptTokens: accounting.reduce(
      (total, value) => total + value.usage.promptTokens,
      0,
    ),
    completionTokens: accounting.reduce(
      (total, value) => total + value.usage.completionTokens,
      0,
    ),
    reasoningTokens: accounting.reduce(
      (total, value) => total + value.usage.reasoningTokens,
      0,
    ),
    costMicrousd:
      accounting.length === 0
        ? 0
        : costIsKnown
          ? accounting.reduce(
              (total, value) => total + value.usage.costMicrousd,
              0,
            )
          : estimatedCostMicrousd,
    costIsEstimate: accounting.length > 0 && !costIsKnown,
  };
}

export async function mutatePage(input: {
  requestId: string;
  jobId: string;
  world: World;
  parent: Revision;
  click: ClickSignal;
  actorHash: string;
}) {
  if (!input.parent.sourceKey) {
    throw new Error("The parent revision has no source snapshot.");
  }

  const config = getAppConfig();
  const storage = getObjectStorage();
  const childRevisionId = randomUUID();
  const jobId = input.jobId;
  const startedAt = Date.now();
  const mutationStrength = sampleMutationStrength(Boolean(input.click));
  const macromutationSelected = shouldTriggerMacromutation();
  const scopeMode = sampleScopeMode({
    isPrimordial: input.parent.depth === 0,
    macromutationSelected,
  });
  const reservation = reserveMutation({
    world: input.world,
    parent: input.parent,
    actorHash: input.actorHash,
    clickedText: input.click?.text || null,
    jobId,
    childRevisionId,
  });

  logInfo("mutation.reserved", {
    requestId: input.requestId,
    jobId,
    parentRevisionId: input.parent.id,
    childRevisionId,
    clickedText: input.click?.text || null,
    mutationStrength,
    macromutationSelected,
    macromutationProbability: MACROMUTATION_PROBABILITY,
    scopeMode,
  });

  let generation: PagePatchGeneration | null = null;
  let macromutationGeneration: MacromutationGeneration | null = null;
  let macromutationAccounting: GenerationAccounting | null = null;
  let briefGeneration: ContentBriefGeneration | null = null;
  let briefAccounting: GenerationAccounting | null = null;
  try {
    markMutationRunning(jobId);
    const parentSourcePromise = storage.getText(input.parent.sourceKey);
    if (macromutationSelected) {
      try {
        macromutationGeneration = await generateMacromutationDirective({
          parent: input.parent,
          click: input.click,
        });
        macromutationAccounting = macromutationGeneration;
        logInfo("mutation.macromutation.generated", {
          requestId: input.requestId,
          jobId,
          childRevisionId,
          model: macromutationGeneration.model,
          directive: macromutationGeneration.macromutation.directive,
          promptTokens: macromutationGeneration.usage.promptTokens,
          completionTokens: macromutationGeneration.usage.completionTokens,
        });
      } catch (error) {
        macromutationAccounting =
          error instanceof PageGenerationFailure ? error.accounting : null;
        logWarn("mutation.macromutation.skipped", {
          requestId: input.requestId,
          jobId,
          childRevisionId,
          error: errorForLog(error),
        });
      }
    }

    let brief: ContentBrief;
    try {
      briefGeneration = await generateContentBrief({
        parent: input.parent,
        click: input.click,
        mutationStrength,
        scopeMode,
        macromutation: macromutationGeneration?.macromutation || null,
      });
      briefAccounting = briefGeneration;
      brief = briefGeneration.brief;
      logInfo("mutation.brief.generated", {
        requestId: input.requestId,
        jobId,
        childRevisionId,
        model: briefGeneration.model,
        subject: brief.subject,
        genre: brief.genre,
      });
    } catch (error) {
      briefAccounting =
        error instanceof PageGenerationFailure ? error.accounting : null;
      brief = fallbackContentBrief({ parent: input.parent, click: input.click });
      logWarn("mutation.brief.fallback", {
        requestId: input.requestId,
        jobId,
        childRevisionId,
        error: errorForLog(error),
      });
    }

    const parentSource = await parentSourcePromise;
    const { annotated } = annotateRegions(parentSource);
    const clickedRegionId = input.click
      ? findRegionIdForClickedText(annotated, input.click.text)
      : null;
    const patchGeneration = await generatePagePatch({
      parent: input.parent,
      annotatedParentSource: annotated,
      clickedRegionId,
      mutationStrength,
      scopeMode,
      brief,
    });
    generation = patchGeneration;
    const pageResult: {
      title: string;
      summary: string;
      dna: PageDna;
      mutation: MutationDescription;
    } = patchGeneration.patch;
    const patchPayload: {
      regions: PatchRegion[];
      appendCss: string;
      appendJs: string;
    } | null =
      patchGeneration.patch.scope === "region"
        ? {
            regions: patchGeneration.patch.regions,
            appendCss: patchGeneration.patch.appendCss,
            appendJs: patchGeneration.patch.appendJs,
          }
        : null;

    const source: string =
      patchGeneration.patch.scope === "full"
        ? cleanGeneratedDocument(patchGeneration.patch.html)
        : cleanGeneratedDocument(
            stripRegionMarkers(
              appendAssetsToSource(
                spliceRegions(annotated, patchGeneration.patch.regions),
                patchGeneration.patch.appendCss,
                patchGeneration.patch.appendJs,
              ),
            ),
          );

    const scope = patchGeneration.patch.scope;

    logInfo("mutation.generated", {
      requestId: input.requestId,
      jobId,
      childRevisionId,
      model: generation.model,
      promptTokens: generation.usage.promptTokens,
      completionTokens: generation.usage.completionTokens,
      reasoningTokens: generation.usage.reasoningTokens,
      scope,
      durationMs: Date.now() - startedAt,
    });

    validateGeneratedDocument(source, config.maxPageBytes);
    const similarity = measureDocumentSimilarity(parentSource, source);
    if (
      input.parent.depth > 0 &&
      mutationStrength < 0.2 &&
      !macromutationGeneration &&
      similarity < 0.08
    ) {
      throw new Error(
        "A subtle mutation diverged too far from its ancestor and was rejected.",
      );
    }

    const page = buildSandboxDocument(source, childRevisionId);
    const hash = contentHash(source);
    const prefix = `worlds/${input.world.id}/revisions/${childRevisionId}`;
    const sourceKey = `${prefix}/source.html`;
    const pageKey = `${prefix}/page.html`;
    const manifestKey = `${prefix}/manifest.json`;
    const generationKey = `${prefix}/generation.json`;
    const createdAt = new Date().toISOString();
    const accounting = aggregateAccounting(
      [generation, macromutationAccounting, briefAccounting],
      reservation.reservedCostMicrousd,
    );
    const persistedMutation = {
      ...pageResult.mutation,
      similarity,
      macromutation: macromutationGeneration?.macromutation || null,
    };

    const manifest = {
      schemaVersion: 1,
      worldId: input.world.id,
      revisionId: childRevisionId,
      parentRevisionId: input.parent.id,
      sourceClickedText: input.click?.text || null,
      depth: input.parent.depth + 1,
      title: pageResult.title,
      summary: pageResult.summary,
      dna: pageResult.dna,
      mutation: persistedMutation,
      contentHash: hash,
      createdAt,
    };
    const durationMs = Date.now() - startedAt;
    const generationMetadata = {
      schemaVersion: 1,
      openrouterGenerationId: generation.generationId,
      model: generation.model,
      temperature: config.openRouter.temperature,
      mutationStrength,
      scope,
      durationMs,
      patch: scope === "region" ? patchPayload : null,
      promptTokens: accounting.promptTokens,
      completionTokens: accounting.completionTokens,
      reasoningTokens: accounting.reasoningTokens,
      reasoningEnabled: false,
      costMicrousd: accounting.costMicrousd,
      costIsEstimate: accounting.costIsEstimate,
      contentBrief: {
        ...brief,
        source: briefGeneration ? "generated" : "fallback",
        model: briefGeneration?.model || null,
        openrouterGenerationId: briefGeneration?.generationId || null,
        usage: briefGeneration?.usage || null,
      },
      macromutation: macromutationGeneration
        ? {
            ...macromutationGeneration.macromutation,
            probability: MACROMUTATION_PROBABILITY,
            openrouterGenerationId: macromutationGeneration.generationId,
            model: macromutationGeneration.model,
            usage: macromutationGeneration.usage,
          }
        : null,
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
      title: pageResult.title,
      summary: pageResult.summary,
      dna: pageResult.dna,
      mutation: persistedMutation,
      sourceKey,
      pageKey,
      manifestKey,
      generationKey,
      contentHash: hash,
      model: generation.model,
      scope,
      temperature: config.openRouter.temperature,
      mutationStrength,
      openrouterGenerationId: generation.generationId,
      promptTokens: accounting.promptTokens,
      completionTokens: accounting.completionTokens,
      reasoningTokens: accounting.reasoningTokens,
      costMicrousd: accounting.costMicrousd,
      costIsEstimate: accounting.costIsEstimate,
      durationMs,
    });

    logInfo("mutation.completed", {
      requestId: input.requestId,
      jobId,
      childRevisionId,
      model: generation.model,
      costMicrousd: accounting.costMicrousd,
      costIsEstimate: accounting.costIsEstimate,
      macromutation: Boolean(macromutationGeneration),
      durationMs: Date.now() - startedAt,
    });

    return {
      revisionId: childRevisionId,
      worldSlug: input.world.slug,
      title: pageResult.title,
      summary: pageResult.summary,
      macromutation: macromutationGeneration?.macromutation || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed.";
    const accounting: GenerationAccounting | null =
      generation ||
      (error instanceof PageGenerationFailure ? error.accounting : null);
    const combinedAccounting = aggregateAccounting(
      [accounting, macromutationAccounting, briefAccounting],
      reservation.reservedCostMicrousd,
    );
    failMutation(reservation, {
      code: error instanceof Error ? error.name || "MUTATION_FAILED" : "MUTATION_FAILED",
      message,
      actualCostMicrousd: combinedAccounting.costMicrousd,
      costIsEstimate: combinedAccounting.costIsEstimate,
      model: accounting?.model,
      openrouterGenerationId: accounting?.generationId,
      promptTokens: combinedAccounting.promptTokens,
      completionTokens: combinedAccounting.completionTokens,
      reasoningTokens: combinedAccounting.reasoningTokens,
      mutationStrength,
    });
    logError("mutation.failed", {
      requestId: input.requestId,
      jobId,
      childRevisionId,
      durationMs: Date.now() - startedAt,
      error: errorForLog(error),
    });
    throw error;
  }
}
