"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-serif text-3xl">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted">{error.message || "Please try again."}</p>
      <button type="button" className="btn-primary mt-6" onClick={reset}>
        Retry
      </button>
    </main>
  );
}
