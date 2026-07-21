"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Dialog, Table } from "@cloudflare/kumo";
import { parseAsInteger, useQueryState } from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { AdminEmptyState } from "@/components/admin-empty-state";

// Kumo's `Table` is a client component; its compound sub-parts
// (Table.Header/Row/Cell) are stripped when imported into a server
// component, so the table lives in this client boundary. Formatting
// helpers are inlined because lib/config is `server-only`.
type Job = {
  id: string;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  failureCode: string | null;
  errorMessage: string | null;
  revisionId: string;
  title: string;
  model: string | null;
  scope: string | null;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  costMicrousd: number;
  costIsEstimate: number;
  durationMs: number | null;
  similarity: number | null;
  changes: string[];
  changeDescription: string | null;
};

function formatMicrousd(micros: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: micros > 0 && micros < 10_000 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000);
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

function statusBadgeVariant(status: string): "success" | "error" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "running" || status === "reserved") return "warning";
  return "neutral";
}

function JobDetailDialog({ job, open, onOpenChange }: { job: Job | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="max-w-lg p-6">
        <Dialog.Title className="text-lg font-semibold text-kumo-default">Mutation details</Dialog.Title>
        <Dialog.Description render={<div />} className="space-y-3 pt-1 text-left text-sm text-kumo-subtle">
          {job ? (
            <>
              <p>
                <span className="font-medium text-kumo-default">{job.title}</span>{" "}
                <span className="font-mono text-[0.9em]">{job.revisionId.slice(0, 8)}</span>
              </p>
              {job.similarity !== null && (
                <p>
                  Similarity to parent:{" "}
                  <span className="font-medium text-kumo-default">
                    {Math.round(job.similarity * 100)}%
                  </span>
                </p>
              )}
              {job.changeDescription && <p>{job.changeDescription}</p>}
              {job.changes.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {job.changes.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
              )}
              {!job.changeDescription && job.changes.length === 0 && <p>No change summary recorded.</p>}
            </>
          ) : null}
        </Dialog.Description>
        <Dialog.Close
          render={(props) => (
            <Button {...props} variant="secondary" className="mt-4">
              Close
            </Button>
          )}
        />
      </Dialog>
    </Dialog.Root>
  );
}

function JobsTableInner({
  jobs,
  recentTotal,
  page,
  pageSize,
}: {
  jobs: Job[];
  recentTotal: number;
  page: number;
  pageSize: number;
}) {
  const [currentPage, setCurrentPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ shallow: false, history: "push" }),
  );
  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(recentTotal / pageSize));
  const activePage = page || currentPage;

  return (
    <>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Time</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Revision</Table.Head>
            <Table.Head>Model</Table.Head>
            <Table.Head>Scope</Table.Head>
            <Table.Head>Tokens</Table.Head>
            <Table.Head>Cost</Table.Head>
            <Table.Head>Duration</Table.Head>
            <Table.Head>Details</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {jobs.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={9}>
                <AdminEmptyState />
              </Table.Cell>
            </Table.Row>
          ) : (
            jobs.map((job) => {
              const tokens = job.promptTokens + job.completionTokens + job.reasoningTokens;
              const hasDetail = Boolean(job.changeDescription) || job.changes.length > 0;
              return (
                <Table.Row key={job.id}>
                  <Table.Cell>{dateTime(job.createdAt)}</Table.Cell>
                  <Table.Cell>
                    <Badge variant={statusBadgeVariant(job.status)} appearance="dot" className="uppercase">
                      {job.status}
                    </Badge>
                    {job.failureCode && (
                      <p className="mt-1 font-mono text-[11px] text-kumo-subtle">{job.failureCode}</p>
                    )}
                    {job.errorMessage && (
                      <p
                        className="mt-1 max-w-[20rem] truncate font-mono text-[11px] text-kumo-subtle"
                        title={job.errorMessage}
                      >
                        {job.errorMessage}
                      </p>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {job.status === "completed" ? (
                      <Link
                        className="text-kumo-default underline-offset-2 hover:underline"
                        href={`/w/shared/r/${job.revisionId}`}
                      >
                        {job.title}
                      </Link>
                    ) : (
                      job.title
                    )}
                    <p className="mt-1 font-mono text-[11px] text-kumo-subtle">
                      {job.revisionId.slice(0, 8)}
                    </p>
                  </Table.Cell>
                  <Table.Cell className="max-w-[14rem] truncate">{job.model || "—"}</Table.Cell>
                  <Table.Cell>
                    <span
                      className={`font-mono text-[11px] uppercase ${
                        job.scope === "region" ? "text-kumo-default" : "text-kumo-subtle"
                      }`}
                    >
                      {job.scope ?? "—"}
                    </span>
                  </Table.Cell>
                  <Table.Cell>{tokens.toLocaleString()}</Table.Cell>
                  <Table.Cell>
                    {formatMicrousd(job.costMicrousd)}
                    {job.costIsEstimate ? "*" : ""}
                  </Table.Cell>
                  <Table.Cell>{formatDuration(job.durationMs)}</Table.Cell>
                  <Table.Cell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!hasDetail}
                      onClick={() => {
                        setDetailJob(job);
                        setDetailOpen(true);
                      }}
                    >
                      Details
                    </Button>
                  </Table.Cell>
                </Table.Row>
              );
            })
          )}
        </Table.Body>
      </Table>

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-kumo-subtle">
          Page {activePage} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={activePage <= 1}
            onClick={() => setCurrentPage(activePage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={activePage >= totalPages}
            onClick={() => setCurrentPage(activePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <JobDetailDialog job={detailJob} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}

export function AdminJobsTable({
  jobs,
  recentTotal,
  page,
  pageSize,
}: {
  jobs: Job[];
  recentTotal: number;
  page: number;
  pageSize: number;
}) {
  return (
    <NuqsAdapter>
      <JobsTableInner jobs={jobs} recentTotal={recentTotal} page={page} pageSize={pageSize} />
    </NuqsAdapter>
  );
}
