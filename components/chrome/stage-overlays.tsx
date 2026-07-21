"use client";

import { Sparkles } from "lucide-react";
import { Badge, Banner } from "@cloudflare/kumo";

export function MutationProgressPill({ nextDepth }: { nextDepth: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-kumo-base/55 backdrop-blur-[2px]"
    >
      <span className="spec-cell size-10" aria-hidden="true" />
      <span className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-semibold text-kumo-default">Evolving…</span>
        <span className="font-mono text-[0.65rem] uppercase text-kumo-subtle">
          generation {nextDepth}
        </span>
      </span>
    </div>
  );
}

export function PreviewPill({ depth }: { depth: number }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 whitespace-nowrap rounded-full ring ring-kumo-line bg-kumo-overlay/90 px-3.5 py-1.5 text-xs text-kumo-subtle shadow-sm backdrop-blur"
    >
      previewing gen {depth} · release to return
    </div>
  );
}

export function MacromutationBanner({
  label,
  directive,
}: {
  label: string;
  directive: string;
}) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-[min(30rem,calc(100%-1.5rem))] -translate-x-1/2"
    >
      <Banner
        variant="alert"
        icon={<Sparkles className="size-4" aria-hidden="true" />}
        title={label}
        description={directive}
        className="rounded-xl shadow-lg backdrop-blur"
        action={
          <Badge variant="warning" className="hidden sm:inline-flex">
            rare 4% event
          </Badge>
        }
      />
    </div>
  );
}
