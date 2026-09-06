"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <div className="card w-full p-7">
        <p className="overline">Something went wrong</p>
        <h1 className="mt-3 font-serif text-3xl text-ink">That didn’t work</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {error.message || "Please try again."}
        </p>
        <button type="button" className="btn-primary mt-6 w-full" onClick={reset}>
          Retry
        </button>
      </div>
    </main>
  );
}