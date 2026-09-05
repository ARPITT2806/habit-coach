"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getLocalUser } from "@/lib/local/session";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    getLocalUser()
      .then((user) => {
        if (user.onboardedAt) {
          router.replace("/today");
        } else {
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        router.replace("/onboarding");
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-5">
      <p className="text-sm text-muted">Starting Habit Flow...</p>
    </main>
  );
}
