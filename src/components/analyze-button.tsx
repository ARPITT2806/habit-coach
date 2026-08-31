"use client";

import { useTransition } from "react";
import { refreshCoach } from "@/lib/actions/coach";

export function AnalyzeButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-primary w-full"
      disabled={pending}
      onClick={() => start(() => refreshCoach())}
    >
      {pending ? "Reading your patterns…" : "Analyze my habits"}
    </button>
  );
}
