"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="message-page">
      <p className="eyebrow">the organism hiccupped</p>
      <h1>This specimen could not be displayed.</h1>
      <button className="primary-button" onClick={reset}>Try again</button>
    </main>
  );
}
