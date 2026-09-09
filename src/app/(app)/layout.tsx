"use client";

import { useEffect, useState } from "react";

import { AppNav } from "@/components/app-nav";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { getLocalUser, type LocalUser } from "@/lib/local/session";
import { syncAllReminders } from "@/lib/local/reminders";

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
        syncAllReminders().catch(() => {
          // reminders are best-effort; tracking still works without them
        });
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
        <p className="sr-only">Loading HabItiva...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-lg">
      <div className="relative z-10 flex min-h-screen flex-col px-6 pb-36 pt-8">
        <div className="flex-1">{children}</div>
      </div>

      <AppNav />
      <RescheduleDialog />
    </div>
  );
}