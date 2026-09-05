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
    getLocalUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-5">
        <p className="text-sm text-muted">Loading Habit Flow...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 pb-28 pt-8">
      <header className="mb-8 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">
          Habit Flow
        </p>

        <p className="text-xs text-muted">
          {user.name || "Your day"}
        </p>
      </header>

      <div className="flex-1">{children}</div>

      <AppNav />
    </div>
  );
}
