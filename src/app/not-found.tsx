import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = { title: "Not found — Habit Coach" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <div className="card w-full p-7">
        <p className="overline">Page not found</p>
        <h1 className="mt-3 font-serif text-3xl text-ink">That screen doesn’t exist</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          The route isn’t there, but your habits are waiting.
        </p>
        <Link href="/today" className="btn-primary mt-6 inline-flex w-full">
          Go to today
        </Link>
      </div>
    </main>
  );
}