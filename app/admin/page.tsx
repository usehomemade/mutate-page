import type { Metadata } from "next";
import { Badge, LayerCard, LinkButton, Meter, Text } from "@cloudflare/kumo";
import { createLoader, parseAsInteger } from "nuqs/server";

import { AdminJobsTable } from "@/components/admin-jobs-table";
import { AdminLimitsForm } from "@/components/admin-limits-form";
import { AdminResetButton } from "@/components/admin-reset-button";
import { formatMicrousd, getAppConfig } from "@/lib/config";
import { getAdminStats } from "@/lib/repository";
import { getRuntimeLimits, isRuntimeLimitsOverridden } from "@/lib/settings";
import { getObjectStorage } from "@/lib/storage";
import { ensureSharedWorld } from "@/lib/world";

const loadSearch = createLoader({ page: parseAsInteger.withDefault(1) });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function shortDate(day: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureSharedWorld();
  const { page } = await loadSearch(searchParams);
  const stats = getAdminStats({ page });
  const config = getAppConfig();
  const limits = getRuntimeLimits();
  const limitsOverridden = isRuntimeLimitsOverridden();
  const storageMode = getObjectStorage().mode;
  const latestDay = stats.daily.at(-1);
  const maxSpend = Math.max(1, ...stats.daily.map((day) => day.spend));
  const maxPages = Math.max(1, ...stats.daily.map((day) => day.pages));
  const pages = stats.totals.pages || 0;
  const maxDepth = stats.totals.max_depth || 0;
  const failedPages = stats.totals.failed_pages || 0;
  const committed = stats.budget.spent + stats.budget.reserved;
  const budgetPercent = Math.min(100, (committed / stats.budget.limit) * 100);

  return (
    <main className="mx-auto w-full max-w-[88rem] px-5 py-10 sm:px-6">
      <header className="mb-9 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">
            private observatory · UTC
          </p>
          <Text as="h1" variant="heading1">
            Mutation telemetry
          </Text>
          <p className="mt-2 text-sm text-kumo-subtle">
            Spend, generations, and the health of the shared evolutionary tree.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <LinkButton href="/" variant="secondary" size="sm">
            View organism ↗
          </LinkButton>
          <AdminResetButton />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Today’s summary">
        <LayerCard className="p-4 ring-1 ring-kumo-brand/25">
          <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">spent today</p>
          <p className="my-2 truncate text-2xl font-semibold tracking-tight text-kumo-strong sm:text-3xl">
            {formatMicrousd(stats.budget.spent)}
          </p>
          <p className="font-mono text-xs text-kumo-subtle">
            {formatMicrousd(stats.budget.reserved)} reserved · {formatMicrousd(stats.budget.remaining)} free
          </p>
          <Meter
            className="mt-3"
            label="Budget committed"
            value={committed}
            max={stats.budget.limit}
            customValue={`${budgetPercent.toFixed(1)}%`}
          />
        </LayerCard>
        <LayerCard className="p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">pages today</p>
          <p className="my-2 truncate text-2xl font-semibold tracking-tight text-kumo-strong sm:text-3xl">
            {latestDay?.pages || 0}
          </p>
          <p className="font-mono text-xs text-kumo-subtle">{latestDay?.failed || 0} failed attempts</p>
        </LayerCard>
        <LayerCard className="p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">all specimens</p>
          <p className="my-2 truncate text-2xl font-semibold tracking-tight text-kumo-strong sm:text-3xl">
            {pages}
          </p>
          <p className="font-mono text-xs text-kumo-subtle">
            {stats.branches} fork points · depth {maxDepth}
          </p>
        </LayerCard>
        <LayerCard className="p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">daily ceiling</p>
          <p className="my-2 truncate text-2xl font-semibold tracking-tight text-kumo-strong sm:text-3xl">
            {formatMicrousd(stats.budget.limit)}
          </p>
          <p className="font-mono text-xs text-kumo-subtle">resets {dateTime(stats.budget.resetsAt)}</p>
        </LayerCard>
        <LayerCard className="p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">generation latency</p>
          <p className="my-2 truncate text-2xl font-semibold tracking-tight text-kumo-strong sm:text-3xl">
            {formatDuration(stats.durations.p95Ms)}
          </p>
          <p className="font-mono text-xs text-kumo-subtle">
            p50 {formatDuration(stats.durations.p50Ms)} · max {formatDuration(stats.durations.maxMs)}
          </p>
        </LayerCard>
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,0.8fr)]">
        <LayerCard className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">last 14 days</p>
              <Text as="h2" variant="heading3">
                Generations &amp; spend
              </Text>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-kumo-subtle">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-xs bg-kumo-brand" aria-hidden />
                pages
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-xs bg-kumo-badge-orange" aria-hidden />
                cost
              </span>
            </div>
          </div>
          <div className="mt-6 grid h-60 grid-cols-[repeat(14,minmax(1rem,1fr))] gap-1">
            {stats.daily.map((day) => {
              const pageHeight = Math.max(day.pages ? 5 : 0, (day.pages / maxPages) * 100);
              const spendHeight = Math.max(day.spend ? 5 : 0, (day.spend / maxSpend) * 100);
              return (
                <div
                  className="grid min-w-0 grid-rows-[minmax(0,1fr)_1.2rem] gap-1"
                  key={day.day}
                  title={`${day.pages} pages · ${formatMicrousd(day.spend)}`}
                >
                  <div className="flex min-h-0 items-end justify-center gap-0.5 border-b border-kumo-line bg-kumo-fill/30">
                    <span
                      className="w-[38%] rounded-t-xs bg-kumo-brand"
                      style={{ height: `${pageHeight}%` }}
                    />
                    <span
                      className="w-[38%] rounded-t-xs bg-kumo-badge-orange"
                      style={{ height: `${spendHeight}%` }}
                    />
                  </div>
                  <p className="truncate text-center font-mono text-[10px] text-kumo-subtle">
                    {shortDate(day.day)}
                  </p>
                </div>
              );
            })}
          </div>
        </LayerCard>

        <LayerCard className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">runtime</p>
              <Text as="h2" variant="heading3">
                Configuration
              </Text>
            </div>
            <Badge variant="success" appearance="dot">
              live
            </Badge>
          </div>
          <dl className="mt-4 divide-y divide-kumo-line text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-kumo-subtle">Generator</dt>
              <dd className="max-w-[65%] truncate font-mono text-xs text-kumo-default">
                {config.demoMode ? "Demo mode" : "OpenRouter"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-kumo-subtle">Model</dt>
              <dd
                className="max-w-[65%] truncate font-mono text-xs text-kumo-default"
                title={config.openRouter.model}
              >
                {config.openRouter.model}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-kumo-subtle">Temperature</dt>
              <dd className="max-w-[65%] truncate font-mono text-xs text-kumo-default">
                {config.openRouter.temperature}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-kumo-subtle">Reasoning</dt>
              <dd className="max-w-[65%] truncate font-mono text-xs text-kumo-default">Not requested</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-kumo-subtle">Provider routing</dt>
              <dd className="max-w-[65%] truncate font-mono text-xs text-kumo-default">Fastest throughput</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-kumo-subtle">Request timeout</dt>
              <dd className="max-w-[65%] truncate font-mono text-xs text-kumo-default">
                {config.openRouter.timeoutSeconds}s
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-kumo-subtle">Snapshots</dt>
              <dd className="max-w-[65%] truncate font-mono text-xs text-kumo-default">
                {storageMode === "r2" ? "Cloudflare R2" : "Local volume"}
              </dd>
            </div>
          </dl>
        </LayerCard>
      </section>

      <section className="mt-3">
        <LayerCard className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">
                budget &amp; quotas
              </p>
              <Text as="h2" variant="heading3">
                Limits
              </Text>
              <p className="mt-2 text-sm text-kumo-subtle">
                Adjustable at runtime — takes effect on the next mutation, no redeploy needed.
              </p>
            </div>
            <Badge variant={limitsOverridden ? "info" : "neutral"} appearance="dot">
              {limitsOverridden ? "overridden" : ".env defaults"}
            </Badge>
          </div>
          <AdminLimitsForm limits={limits} overridden={limitsOverridden} />
        </LayerCard>
      </section>

      <section className="mt-3">
        <LayerCard className="p-0">
          <div className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-kumo-subtle">
                {stats.recentTotal} total attempts
              </p>
              <Text as="h2" variant="heading3">
                Mutation logs
              </Text>
            </div>
            <p className="font-mono text-xs text-kumo-subtle">
              {failedPages} failed revision{failedPages === 1 ? "" : "s"} retained as audit records
            </p>
          </div>
          <div className="overflow-x-auto px-4 pb-4">
            <AdminJobsTable
              jobs={stats.recent}
              recentTotal={stats.recentTotal}
              page={stats.page}
              pageSize={stats.pageSize}
            />
          </div>
        </LayerCard>
      </section>

      <footer className="mt-4 flex flex-col gap-1 pt-2 font-mono text-xs text-kumo-subtle sm:flex-row sm:items-center sm:justify-between">
        <span>SQLite is the source of truth; every ready page is an immutable object snapshot.</span>
        <a className="text-kumo-subtle hover:text-kumo-default" href="/api/health">
          health.json
        </a>
      </footer>
    </main>
  );
}
