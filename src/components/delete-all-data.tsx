"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { deleteAllLocalData } from "@/lib/local/database";

import { ErrorText } from "./states";

export function DeleteAllData() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setBusy(true);
    setError("");

    try {
      await deleteAllLocalData();
      router.replace("/");
    } catch {
      // Web/server deployments have no on-device database; never leave
      // the button stuck and never crash the page.
      setError("Deleting data is only available inside the installed app.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <p className="mt-8 text-center text-xs text-muted">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="underline underline-offset-4 hover:text-ink disabled:opacity-50"
      >
        {confirming
          ? busy
            ? "Deleting all data…"
            : "Tap again to permanently delete all data on this device"
          : "Delete all data on this device"}
      </button>
      <ErrorText message={error} />
    </p>
  );
}