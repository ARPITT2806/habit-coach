export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-5 pt-8" aria-label="Loading">
      <div className="h-14 animate-pulse rounded-3xl bg-surface-2" />
      <div className="h-56 animate-pulse rounded-4xl bg-surface-2" />
      <div className="h-28 animate-pulse rounded-4xl bg-surface-2" />
    </main>
  );
}
