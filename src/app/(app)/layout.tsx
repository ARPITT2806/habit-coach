"use client";

import { useEffect, useState } from "react";

import { AppNav } from "@/components/app-nav";
import { getLocalUser, type LocalUser } from "@/lib/local/session";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    getLocalUser()
      .then((localUser) => {
        if (alive) setUser(localUser);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div
          className="h-12 w-12 animate-pulse rounded-3xl bg-accent-soft"
          style={{ animationDuration: "1.4s" }}
        />
        <p className="sr-only">Loading Habit Coach...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-lg">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[-120px] z-0 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-[-90px] top-40 z-0 h-[220px] w-[220px] rounded-full bg-mint/10 blur-3xl"
      />

      <div className="relative z-10 flex min-h-screen flex-col px-6 pb-36 pt-8">
        <div className="flex-1">{children}</div>
      </div>

      <AppNav />
    </div>
  );
}