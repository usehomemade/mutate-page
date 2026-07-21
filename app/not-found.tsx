import Image from "next/image";
import { Link, Text } from "@cloudflare/kumo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-4 px-8">
      <Image src="/mark.svg" alt="" width="38" height="38" className="mb-2" />
      <p className="font-mono text-xs uppercase text-kumo-subtle">lost fossil</p>
      <Text as="h1" variant="heading1">
        That revision is not in this world.
      </Text>
      <Link href="/">Return to the living page →</Link>
    </main>
  );
}
