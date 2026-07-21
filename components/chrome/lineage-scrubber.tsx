"use client";

import type { RefObject } from "react";

import { Tooltip } from "@cloudflare/kumo";
import { cn } from "@/lib/utils";

type LineageEntry = { id: string; depth: number; title: string };

type Props<T extends LineageEntry> = {
  lineage: T[];
  currentId: string;
  previewId: string | null;
  currentTickRef: RefObject<HTMLButtonElement | null>;
  onPreview: (node: T) => void;
  onClearPreview: () => void;
  onNavigate: (node: T, index: number, instant: boolean) => void;
};

export function LineageScrubber<T extends LineageEntry>({
  lineage,
  currentId,
  previewId,
  currentTickRef,
  onPreview,
  onClearPreview,
  onNavigate,
}: Props<T>) {
  return (
    <nav
      aria-label="Ancestral timeline"
      className="relative min-w-0"
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") onClearPreview();
      }}
    >
      <div className="no-scrollbar lineage-scrub-mask h-11 overflow-x-auto overflow-y-hidden sm:h-12">
        <ol className="relative flex h-full min-w-full items-stretch justify-center px-6">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-6 right-6 top-1/2 h-px -translate-y-1/2 bg-kumo-line"
          />
          {lineage.map((node, index) => {
            const current = node.id === currentId;
            const previewed = node.id === previewId;
            return (
              <li
                key={node.id}
                className="relative flex w-9 shrink-0 items-stretch justify-center sm:w-11"
              >
                <Tooltip
                  content={node.title}
                  side="top"
                  render={
                    <button
                      ref={current ? currentTickRef : undefined}
                      type="button"
                      className="group relative flex w-full flex-col items-center justify-center gap-1.5 outline-none"
                      aria-current={current ? "page" : undefined}
                      aria-label={`Generation ${node.depth}: ${node.title}. ${
                        current ? "Current specimen." : "Hover to preview, click to visit."
                      }`}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "touch") onPreview(node);
                      }}
                      onFocus={() => onPreview(node)}
                      onBlur={onClearPreview}
                      onClick={(event) => onNavigate(node, index, event.detail === 0)}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "z-10 w-0.5 origin-center rounded-full transition-transform",
                          current || previewed
                            ? "h-5 scale-y-100 bg-kumo-brand"
                            : cn(
                                "scale-y-90 bg-current text-kumo-subtle/50 group-hover:scale-y-100 group-focus-visible:scale-y-100",
                                node.depth % 10 === 0
                                  ? "h-5"
                                  : node.depth % 5 === 0
                                    ? "h-3.5"
                                    : "h-2.5",
                              ),
                        )}
                      />
                      <span
                        className={cn(
                          "font-mono text-[0.6rem] text-kumo-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                          (current || previewed) &&
                            "text-[var(--color-kumo-brand)] opacity-100",
                        )}
                      >
                        {node.depth}
                      </span>
                    </button>
                  }
                />
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
