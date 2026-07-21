"use client";

import { Button, Text } from "@cloudflare/kumo";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-6 px-8">
      <div>
        <p className="font-mono text-xs uppercase text-kumo-subtle">the organism hiccupped</p>
        <Text as="h1" variant="heading1">
          This specimen could not be displayed.
        </Text>
      </div>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
