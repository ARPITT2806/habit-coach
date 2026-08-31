import type { Metadata } from "next";

export const metadata: Metadata = { title: "Not found — North" };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="mt-3 text-sm text-muted">That screen does not exist.</p>
      <a href="/today" className="btn-primary mt-6 inline-flex">
        Go to today
      </a>
    </main>
  );
}
