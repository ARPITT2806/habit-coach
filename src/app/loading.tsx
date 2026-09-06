export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
      <div
        className="flex h-12 w-12 animate-pulse items-center justify-center rounded-3xl bg-accent-soft"
        style={{ animationDuration: "1.4s" }}
      />
    </main>
  );
}