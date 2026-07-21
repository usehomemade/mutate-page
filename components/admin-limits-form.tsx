"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowCounterClockwise, FloppyDisk } from "@phosphor-icons/react";
import { Button, Input } from "@cloudflare/kumo";

type RuntimeLimits = {
  dailyBudgetUsd: number;
  costReservationUsd: number;
  maxConcurrent: number;
  staleAfterSeconds: number;
  visitorDailyLimit: number;
  cooldownSeconds: number;
};

type Props = {
  limits: RuntimeLimits;
  overridden: boolean;
};

const FIELDS: Array<{
  key: keyof RuntimeLimits;
  label: string;
  description: string;
  step: string;
  min: number;
}> = [
  {
    key: "dailyBudgetUsd",
    label: "Daily budget (USD)",
    description: "Total OpenRouter spend allowed per UTC day.",
    step: "0.01",
    min: 0.01,
  },
  {
    key: "costReservationUsd",
    label: "Per-mutation reservation (USD)",
    description: "Held against the budget while a mutation is generating.",
    step: "0.001",
    min: 0.001,
  },
  {
    key: "maxConcurrent",
    label: "Max concurrent generations",
    description: "How many mutations can run at once.",
    step: "1",
    min: 1,
  },
  {
    key: "visitorDailyLimit",
    label: "Visitor daily limit",
    description: "Mutations a single visitor can trigger per UTC day.",
    step: "1",
    min: 1,
  },
  {
    key: "cooldownSeconds",
    label: "Cooldown (seconds)",
    description: "Minimum gap between one visitor's mutations.",
    step: "1",
    min: 0,
  },
  {
    key: "staleAfterSeconds",
    label: "Job lease (seconds)",
    description: "How long a stuck generation is held before being marked failed.",
    step: "1",
    min: 60,
  },
];

export function AdminLimitsForm({ limits, overridden }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<RuntimeLimits>(limits);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        limits?: RuntimeLimits;
        error?: { message?: string };
      } | null;
      if (!response.ok || !result?.ok || !result.limits) {
        throw new Error(result?.error?.message || "Save failed.");
      }
      setValues(result.limits);
      setMessage("Limits updated.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetToDefaults() {
    const confirmed = window.confirm(
      "Reset every limit to the values baked into the environment configuration?",
    );
    if (!confirmed) return;

    setIsResetting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        limits?: RuntimeLimits;
        error?: { message?: string };
      } | null;
      if (!response.ok || !result?.ok || !result.limits) {
        throw new Error(result?.error?.message || "Reset failed.");
      }
      setValues(result.limits);
      setMessage("Limits reset to environment defaults.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reset failed.");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <Input
            key={field.key}
            size="sm"
            type="number"
            step={field.step}
            min={field.min}
            label={field.label}
            description={field.description}
            value={values[field.key]}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setValues((current) => ({
                ...current,
                [field.key]: Number.isFinite(parsed) ? parsed : current[field.key],
              }));
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={<FloppyDisk size={14} />}
            disabled={isSaving || isResetting}
            loading={isSaving}
          >
            {isSaving ? "Saving…" : "Save limits"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<ArrowCounterClockwise size={14} />}
            disabled={isSaving || isResetting || !overridden}
            loading={isResetting}
            onClick={() => void resetToDefaults()}
          >
            {isResetting ? "Resetting…" : "Reset to .env defaults"}
          </Button>
        </div>
        {(message || error) && (
          <p
            role="status"
            className={`font-mono text-[11px] ${error ? "text-kumo-danger" : "text-kumo-subtle"}`}
          >
            {error || message}
          </p>
        )}
      </div>
    </form>
  );
}
