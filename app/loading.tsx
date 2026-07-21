export default function Loading() {
  return (
    <main
      aria-label="Loading"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-kumo-base text-kumo-default"
    >
      <span className="spec-cell size-12" aria-hidden="true" />
      <span className="font-mono text-[0.6rem] uppercase text-kumo-subtle">
        loading
      </span>
    </main>
  );
}
