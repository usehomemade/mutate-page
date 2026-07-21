"use client";

import { Info } from "@phosphor-icons/react";
import { Button, Dialog } from "@cloudflare/kumo";

export function AboutDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={(props) => (
          <Button
            {...props}
            variant="ghost"
            shape="square"
            icon={<Info aria-hidden="true" />}
            aria-label="About mutate.page"
          />
        )}
      />
      <Dialog className="max-w-md px-6 py-5">
        <Dialog.Title className="text-lg font-semibold text-kumo-default">
          What is mutate.page?
        </Dialog.Title>
        <Dialog.Description
          render={<div />}
          className="space-y-3 pt-1 text-left text-sm text-kumo-subtle"
        >
          <p>
            One public web page that evolves forever. Every visitor sees
            the current generation.
          </p>
          <p>
            Click a link or control{" "}
            <span className="font-medium text-kumo-default">inside the page</span>{" "}
            to ask an AI model to evolve it into a child revision.
          </p>
          <p>
            Old revisions branch instead of being overwritten, so the
            whole lineage stays explorable in the map.
          </p>
        </Dialog.Description>
        <p className="mt-4 text-xs text-kumo-subtle">
          Built by{" "}
          <a
            href="https://x.com/tunctn_"
            target="_blank"
            rel="noreferrer"
            className="text-kumo-default underline underline-offset-4 hover:text-kumo-brand"
          >
            @tunctn_
          </a>{" "}
          · <span className="font-mono">mutate.page</span>
        </p>
      </Dialog>
    </Dialog.Root>
  );
}
