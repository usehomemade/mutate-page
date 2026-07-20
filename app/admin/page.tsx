import type { Metadata } from "next";
import Link from "next/link";

import { formatMicrousd, getAppConfig } from "@/lib/config";
import { getAdminStats } from "@/lib/repository";
import { getObjectStorage } from "@/lib/storage";
import { ensureSharedWorld } from "@/lib/world";

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

export default async function AdminPage() {
  await ensureSharedWorld();
  const stats = getAdminStats();
  const config = getAppConfig();
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
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">private observatory · UTC</p>
          <h1>Mutation telemetry</h1>
          <p>Spend, generations, and the health of the shared evolutionary tree.</p>
        </div>
        <Link className="quiet-button" href="/">View organism ↗</Link>
      </header>

      <section className="admin-cards" aria-label="Today’s summary">
        <article className="metric-card accent-card">
          <span>spent today</span>
          <strong>{formatMicrousd(stats.budget.spent)}</strong>
          <small>
            {formatMicrousd(stats.budget.reserved)} reserved · {formatMicrousd(stats.budget.remaining)} free
          </small>
          <div className="budget-track" title={`${budgetPercent.toFixed(1)}% committed`}>
            <span style={{ width: `${budgetPercent}%` }} />
          </div>
        </article>
        <article className="metric-card">
          <span>pages today</span>
          <strong>{latestDay?.pages || 0}</strong>
          <small>{latestDay?.failed || 0} failed attempts</small>
        </article>
        <article className="metric-card">
          <span>all specimens</span>
          <strong>{pages}</strong>
          <small>{stats.branches} fork points · depth {maxDepth}</small>
        </article>
        <article className="metric-card">
          <span>daily ceiling</span>
          <strong>{formatMicrousd(stats.budget.limit)}</strong>
          <small>resets {dateTime(stats.budget.resetsAt)}</small>
        </article>
      </section>

      <section className="admin-grid">
        <article className="admin-panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">last 14 days</p>
              <h2>Generations & spend</h2>
            </div>
            <div className="chart-legend"><span className="page-key">pages</span><span className="spend-key">cost</span></div>
          </div>
          <div className="day-chart">
            {stats.daily.map((day) => {
              const pageHeight = Math.max(day.pages ? 5 : 0, (day.pages / maxPages) * 100);
              const spendHeight = Math.max(day.spend ? 5 : 0, (day.spend / maxSpend) * 100);
              return (
                <div className="day-column" key={day.day} title={`${day.pages} pages · ${formatMicrousd(day.spend)}`}>
                  <div className="bar-area">
                    <span className="page-bar" style={{ height: `${pageHeight}%` }} />
                    <span className="spend-bar" style={{ height: `${spendHeight}%` }} />
                  </div>
                  <small>{shortDate(day.day)}</small>
                </div>
              );
            })}
          </div>
        </article>

        <article className="admin-panel runtime-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">runtime</p>
              <h2>Configuration</h2>
            </div>
            <span className="status-dot">live</span>
          </div>
          <dl className="runtime-list">
            <div><dt>Generator</dt><dd>{config.demoMode ? "Demo mode" : "OpenRouter"}</dd></div>
            <div><dt>Model</dt><dd title={config.openRouter.model}>{config.openRouter.model}</dd></div>
            <div><dt>Temperature</dt><dd>{config.openRouter.temperature}</dd></div>
            <div><dt>Snapshots</dt><dd>{storageMode === "r2" ? "Cloudflare R2" : "Local volume"}</dd></div>
            <div><dt>Concurrency</dt><dd>{config.mutation.maxConcurrent}</dd></div>
            <div><dt>Job lease</dt><dd>{config.mutation.staleAfterSeconds}s</dd></div>
            <div><dt>Visitor quota</dt><dd>{config.mutation.visitorDailyLimit}/day</dd></div>
          </dl>
        </article>
      </section>

      <section className="admin-panel jobs-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">latest 30 attempts</p>
            <h2>Mutation ledger</h2>
          </div>
          <small>{failedPages} failed revision{failedPages === 1 ? "" : "s"} retained as audit records</small>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>time</th>
                <th>status</th>
                <th>revision</th>
                <th>model</th>
                <th>tokens</th>
                <th>cost</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.length === 0 ? (
                <tr><td colSpan={6} className="empty-cell">No mutations yet.</td></tr>
              ) : stats.recent.map((job) => {
                const tokens = job.promptTokens + job.completionTokens + job.reasoningTokens;
                return (
                  <tr key={job.id}>
                    <td>{dateTime(job.createdAt)}</td>
                    <td>
                      <span className={`job-status ${job.status}`}>{job.status}</span>
                      {job.failureCode && <small className="failure-code">{job.failureCode}</small>}
                    </td>
                    <td>
                      {job.status === "completed" ? (
                        <Link href={`/w/shared/r/${job.revisionId}`}>{job.title}</Link>
                      ) : job.title}
                      <small className="mono-id">{job.revisionId.slice(0, 8)}</small>
                    </td>
                    <td className="model-cell">{job.model || "—"}</td>
                    <td>{tokens.toLocaleString()}</td>
                    <td>{formatMicrousd(job.costMicrousd)}{job.costIsEstimate ? "*" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="admin-footer">
        <span>SQLite is the source of truth; every ready page is an immutable object snapshot.</span>
        <a href="/api/health">health.json</a>
      </footer>
    </main>
  );
}
