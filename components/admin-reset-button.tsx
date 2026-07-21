"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo";

export function AdminResetButton() {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resetWorld() {
    const confirmed = window.confirm(
      "Reset the shared world? This permanently deletes every generated revision, mutation job, and recorded cost, then restores the primordial page.",
    );
    if (!confirmed) return;

    setIsResetting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "reset-shared-world" }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        storageCleared?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error?.message || "Reset failed.");
      }

      setMessage(
        result.storageCleared === false
          ? "World reset; some orphaned snapshots could not be removed."
          : "World reset to primordial.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary-destructive"
        size="sm"
        icon={<ArrowCounterClockwise size={14} />}
        disabled={isResetting}
        loading={isResetting}
        onClick={() => void resetWorld()}
      >
        {isResetting ? "Resetting…" : "Reset world"}
      </Button>
      {message && (
        <p role="status" className="max-w-[18rem] text-right font-mono text-[11px] text-kumo-subtle">
          {message}
        </p>
      )}
    </div>
  );
}
