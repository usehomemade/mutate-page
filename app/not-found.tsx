import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="message-page">
      <Image src="/mark.svg" alt="" width="38" height="38" />
      <p className="eyebrow">lost fossil</p>
      <h1>That revision is not in this world.</h1>
      <Link className="text-link" href="/">Return to the living page →</Link>
    </main>
  );
}
