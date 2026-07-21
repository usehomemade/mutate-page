"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TreeStructure } from "@phosphor-icons/react";
import {
  Badge as KumoBadge,
  Button as KumoButton,
  Toasty,
  TooltipProvider,
  createKumoToastManager,
} from "@cloudflare/kumo";

import {
  EvolutionTree,
  type EvolutionTreeNode,
} from "@/components/evolution-tree";
import { LineageScrubber } from "@/components/chrome/lineage-scrubber";
import { AboutDialog } from "@/components/chrome/about-dialog";
import {
  MacromutationBanner,
  MutationProgressPill,
  PreviewPill,
} from "@/components/chrome/stage-overlays";
import { readJsonResponse } from "@/lib/api-response";
import { cn } from "@/lib/utils";

// Created once at module scope so the error-toast effect below (which runs
// inside the same component that renders <Toasty>) can dispatch without
// needing to be a descendant of the provider — see Kumo's "dispatching
// toasts from non-React-component code" pattern.
const toastManager = createKumoToastManager();

type Macromutation = {
  label: string;
  directive: string;
};

type TreeNode = EvolutionTreeNode & {
  macromutation: Macromutation | null;
};

type Revision = Omit<TreeNode, "children"> & { contentHash: string | null };

type Props = {
  world: { id: string; slug: string; name: string };
  revision: Revision;
  tree: TreeNode[];
  lineage: TreeNode[];
};

type MutationResult = {
  revisionId?: string;
  worldSlug?: string;
  macromutation?: Macromutation | null;
  error?: { message?: string };
};

type MutationStatus = MutationResult & {
  status?: "reserved" | "running" | "completed" | "failed";
};

type TimeJump = {
  phase: "departing" | "arriving";
  direction: "back" | "forward";
};

const TIME_JUMP_STORAGE_KEY = "mutate-page:pending-time-jump";

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function WorldClient({ world, revision, tree, lineage }: Props) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const currentTickRef = useRef<HTMLButtonElement>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const arrivalTimerRef = useRef<number | null>(null);
  const pendingTargetRef = useRef<{
    id: string;
    direction: "back" | "forward";
  } | null>(null);
  const previousRevisionRef = useRef(revision.id);
  const reducedMotion = useReducedMotion();
  const [isMutating, setIsMutating] = useState(false);
  const [loadedRevisionId, setLoadedRevisionId] = useState(revision.id);
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);
  const [loadedPreviewRevisionId, setLoadedPreviewRevisionId] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [timeJump, setTimeJump] = useState<TimeJump | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRevisionIdRef = useRef<string | null>(null);

  const byId = useMemo(() => new Map(tree.map((node) => [node.id, node])), [tree]);
  const currentNode = byId.get(revision.id) || { ...revision, children: [] };
  const displayedNode =
    (previewRevisionId ? byId.get(previewRevisionId) : undefined) || currentNode;
  const isPreviewing = displayedNode.id !== revision.id;
  const mutationCount = Math.max(0, tree.length - 1);

  const navigateWithTimeJump = useCallback(
    (
      targetId: string,
      href: string,
      direction: "back" | "forward",
      previewTarget = true,
      instant = false,
    ) => {
      if (targetId === revision.id) {
        previewRevisionIdRef.current = null;
        setPreviewRevisionId(null);
        return;
      }

      if (instant) {
        previewRevisionIdRef.current = null;
        setPreviewRevisionId(null);
        router.push(href);
        return;
      }

      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
      pendingTargetRef.current = { id: targetId, direction };
      try {
        window.sessionStorage.setItem(
          TIME_JUMP_STORAGE_KEY,
          JSON.stringify({ id: targetId, direction, createdAt: Date.now() }),
        );
      } catch {
        // The departure still works when session storage is unavailable.
      }
      if (previewTarget && byId.has(targetId)) {
        if (previewRevisionId !== targetId) setLoadedPreviewRevisionId(null);
        previewRevisionIdRef.current = targetId;
        setPreviewRevisionId(targetId);
      }
      setTimeJump({ phase: "departing", direction });
      router.prefetch(href);
      navigationTimerRef.current = window.setTimeout(
        () => router.push(href),
        reducedMotion ? 0 : 210,
      );
    },
    [byId, previewRevisionId, reducedMotion, revision.id, router],
  );

  const mutate = useCallback(
    async (click: { text: string; tag: string } | null) => {
      if (isMutating) return;
      setIsMutating(true);
      setError(null);

      try {
        const mutationId = crypto.randomUUID();

        async function recoverMutation() {
          const deadline = Date.now() + 100_000;
          let missingAttempts = 0;

          while (Date.now() < deadline) {
            const statusResponse = await fetch(
              `/api/mutations/${encodeURIComponent(mutationId)}`,
              { cache: "no-store" },
            );
            const status = await readJsonResponse<MutationStatus>(statusResponse);

            if (statusResponse.status === 404) {
              missingAttempts += 1;
              if (missingAttempts >= 3) {
                throw new Error("The mutation request did not reach the server.");
              }
            } else if (status?.status === "completed" && status.revisionId) {
              return status;
            } else if (status?.status === "failed") {
              throw new Error(status.error?.message || "The mutation failed.");
            } else if (!statusResponse.ok && status?.error?.message) {
              throw new Error(status.error.message);
            }

            await wait(1_000);
          }

          throw new Error("The mutation is still running. Reload shortly to see its result.");
        }

        let response: Response | null = null;
        try {
          response = await fetch("/api/mutate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: mutationId,
              parentRevisionId: revision.id,
              clickedText: click?.text ?? null,
              clickedTag: click?.tag ?? null,
            }),
          });
        } catch {
          // A completed job can still be recovered after a proxy disconnect.
        }

        let result: MutationResult | null = response
          ? await readJsonResponse<MutationResult>(response)
          : null;
        if (response && !response.ok && result?.error?.message) {
          throw new Error(result.error.message);
        }
        if (!result?.revisionId) result = await recoverMutation();
        if (!result.revisionId) throw new Error("The mutation failed.");

        const destination = `/w/${result.worldSlug || world.slug}/r/${result.revisionId}`;
        navigateWithTimeJump(result.revisionId, destination, "forward", false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The mutation failed.");
        setIsMutating(false);
      }
    },
    [isMutating, navigateWithTimeJump, revision.id, world.slug],
  );

  useEffect(() => {
    function receiveMutationRequest(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const payload = event.data as unknown;
      if (!payload || typeof payload !== "object") return;

      const message = payload as {
        type?: unknown;
        revisionId?: unknown;
        clickedText?: unknown;
        clickedTag?: unknown;
      };
      if (
        message.type !== "mutate-page:evolve" ||
        message.revisionId !== revision.id ||
        typeof message.clickedText !== "string" ||
        typeof message.clickedTag !== "string"
      ) {
        return;
      }

      void mutate(
        message.clickedText
          ? { text: message.clickedText, tag: message.clickedTag }
          : null,
      );
    }

    window.addEventListener("message", receiveMutationRequest);
    return () => window.removeEventListener("message", receiveMutationRequest);
  }, [mutate, revision.id]);

  useEffect(() => {
    if (previousRevisionRef.current === revision.id) return;
    const pending = pendingTargetRef.current;
    const direction = pending?.id === revision.id
      ? pending.direction
      : revision.depth >= currentNode.depth
        ? "forward"
        : "back";

    previousRevisionRef.current = revision.id;
    pendingTargetRef.current = null;
    const nextPreviewId = previewRevisionIdRef.current === revision.id
      ? revision.id
      : null;
    previewRevisionIdRef.current = nextPreviewId;
    setPreviewRevisionId(nextPreviewId);
    setIsMutating(false);
    setTimeJump({ phase: "arriving", direction });
    if (arrivalTimerRef.current !== null) {
      window.clearTimeout(arrivalTimerRef.current);
    }
    arrivalTimerRef.current = window.setTimeout(
      () => setTimeJump(null),
      reducedMotion ? 0 : 260,
    );
  }, [currentNode.depth, reducedMotion, revision.depth, revision.id]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(TIME_JUMP_STORAGE_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw) as {
        id?: unknown;
        direction?: unknown;
        createdAt?: unknown;
      };
      if (
        pending.id !== revision.id ||
        (pending.direction !== "back" && pending.direction !== "forward") ||
        typeof pending.createdAt !== "number" ||
        Date.now() - pending.createdAt > 30_000
      ) {
        return;
      }

      window.sessionStorage.removeItem(TIME_JUMP_STORAGE_KEY);
      const direction = pending.direction;
      const kickoff = window.setTimeout(() => {
        setTimeJump({ phase: "arriving", direction });
        arrivalTimerRef.current = window.setTimeout(
          () => setTimeJump(null),
          reducedMotion ? 0 : 260,
        );
      }, 0);
      return () => window.clearTimeout(kickoff);
    } catch {
      // Navigation remains functional if stored transition metadata is malformed.
    }
  }, [reducedMotion, revision.id]);

  useEffect(() => {
    currentTickRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "auto",
    });
  }, [revision.id]);

  useEffect(() => () => {
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
    }
    if (arrivalTimerRef.current !== null) {
      window.clearTimeout(arrivalTimerRef.current);
    }
  }, []);

  // Presentational only: surface fetch/mutation errors as a toast instead
  // of an inline banner. `error` remains the source of truth — `mutate`
  // already resets it to null at the start of every attempt, so this
  // effect naturally fires once per new error without needing to clear
  // state itself (avoids a setState-in-effect cascade).
  useEffect(() => {
    if (error) toastManager.add({ title: error, variant: "error" });
  }, [error]);

  function preview(node: TreeNode) {
    if (pendingTargetRef.current || node.id === revision.id) return;
    if (previewRevisionId !== node.id) setLoadedPreviewRevisionId(null);
    previewRevisionIdRef.current = node.id;
    setPreviewRevisionId(node.id);
  }

  function clearPreview() {
    if (pendingTargetRef.current || !previewRevisionId) return;
    previewRevisionIdRef.current = null;
    setPreviewRevisionId(null);
    setLoadedPreviewRevisionId(null);
  }

  function selectRevision(node: EvolutionTreeNode, instant = false) {
    const direction = node.depth < revision.depth ? "back" : "forward";
    setTreeOpen(false);
    navigateWithTimeJump(
      node.id,
      `/w/${world.slug}/r/${node.id}`,
      direction,
      true,
      instant,
    );
  }

  const jumpClass = timeJump
    ? ` time-${timeJump.phase} time-${timeJump.direction}`
    : "";
  const currentFrameReady = loadedRevisionId === revision.id;
  const currentVersion = revision.contentHash || revision.id;
  const previewNode = previewRevisionId
    ? byId.get(previewRevisionId)
    : undefined;

  return (
    <TooltipProvider>
      <Toasty toastManager={toastManager}>
      <main className="relative isolate grid h-dvh min-h-[32rem] grid-rows-[1fr_auto] bg-kumo-base text-kumo-default">
        <section
          className="relative isolate flex min-h-0 items-center justify-center overflow-hidden px-3 py-3 sm:px-8 sm:py-6"
          aria-busy={isMutating}
        >
          <div
            className={`spec-surface relative h-full w-full max-w-[92rem] overflow-hidden rounded-2xl border border-kumo-line bg-kumo-elevated${jumpClass}`}
          >
            <iframe
              ref={frameRef}
              key={revision.id}
              className={cn(
                "absolute inset-0 h-full w-full border-0 bg-kumo-elevated transition-opacity duration-300",
                currentFrameReady ? "opacity-100" : "opacity-0",
                isPreviewing && "pointer-events-none",
              )}
              src={`/api/revisions/${encodeURIComponent(revision.id)}/document?v=${encodeURIComponent(currentVersion)}`}
              title={`Generated page: ${revision.title}`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              onLoad={() => {
                setLoadedRevisionId(revision.id);
                if (previewRevisionIdRef.current === revision.id) {
                  previewRevisionIdRef.current = null;
                  setPreviewRevisionId(null);
                }
              }}
            />

            {previewNode && (
              <iframe
                key={`preview-${previewNode.id}`}
                className={cn(
                  "pointer-events-none absolute inset-0 z-[2] h-full w-full border-0 bg-kumo-elevated transition-opacity duration-300",
                  loadedPreviewRevisionId === previewNode.id ? "opacity-100" : "opacity-0",
                )}
                src={`/api/revisions/${encodeURIComponent(previewNode.id)}/document?v=${encodeURIComponent(previewNode.id)}`}
                title={`Preview: ${previewNode.title}`}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                tabIndex={-1}
                aria-hidden="true"
                onLoad={() => {
                  if (previewRevisionIdRef.current === previewNode.id) {
                    setLoadedPreviewRevisionId(previewNode.id);
                  }
                }}
              />
            )}

            {isMutating && <MutationProgressPill nextDepth={revision.depth + 1} />}

            {isPreviewing && <PreviewPill depth={displayedNode.depth} />}

            {displayedNode.macromutation && (
              <MacromutationBanner
                label={displayedNode.macromutation.label}
                directive={displayedNode.macromutation.directive}
              />
            )}
          </div>
        </section>

        <footer className="relative z-10 flex items-center gap-2 border-t border-kumo-line bg-kumo-base/80 px-3 py-2.5 backdrop-blur sm:h-16 sm:gap-3 sm:px-4 sm:py-0">
          <div className="flex shrink-0 items-center gap-1.5">
            <AboutDialog />
            <KumoBadge variant="secondary" className="font-mono">
              GEN {displayedNode.depth}
            </KumoBadge>
          </div>

          <div className="min-w-0 flex-1">
            <LineageScrubber
              lineage={lineage}
              currentId={revision.id}
              previewId={previewRevisionId}
              currentTickRef={currentTickRef}
              onPreview={preview}
              onClearPreview={clearPreview}
              onNavigate={(node, index, instant) => {
                const direction = index < lineage.length - 1 ? "back" : "forward";
                navigateWithTimeJump(
                  node.id,
                  `/w/${world.slug}/r/${node.id}`,
                  direction,
                  true,
                  instant,
                );
              }}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <KumoButton
              type="button"
              variant="secondary"
              onClick={() => setTreeOpen(true)}
              aria-label={`Open evolution map with ${mutationCount} mutations`}
              icon={<TreeStructure weight="bold" />}
            >
              <span className="hidden sm:inline">Map</span>
            </KumoButton>
            <KumoBadge variant="neutral">{mutationCount}</KumoBadge>
          </div>
        </footer>
      </main>

      <EvolutionTree
        open={treeOpen}
        onOpenChange={setTreeOpen}
        currentRevisionId={revision.id}
        nodes={tree}
        onSelect={selectRevision}
      />
      </Toasty>
    </TooltipProvider>
  );
}
