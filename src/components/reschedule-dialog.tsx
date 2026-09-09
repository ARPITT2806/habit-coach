"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { TimePickerField } from "@/components/time-picker";
import { ErrorText } from "@/components/states";
import { formatTime, todayKey } from "@/lib/dates";
import { useModalBackHandler } from "@/lib/navigation/use-modal-back";
import {
  clearPendingReschedule,
  getPendingReschedule,
  rescheduleReminder,
  type PendingReschedule,
} from "@/lib/local/reminders";

/**
 * Handles the notification RESCHEDULE action. The native receiver stores the
 * habit occurrence and opens the app; this dialog (mounted in the app layout
 * so it works from any screen) lets the user pick a new time and schedules
 * a one-off replacement alarm via the existing AlarmManager infrastructure.
 */
export function RescheduleDialog() {
  const [pending, setPending] = useState<PendingReschedule | null>(null);
  const [newTime, setNewTime] = useState("07:00");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    try {
      const found = await getPendingReschedule();
      if (found) {
        setPending(found);
        setNewTime(found.timeText && found.timeText.length === 5 ? found.timeText : "07:00");
        setError("");
        setSaved(false);
      }
    } catch {
      // best-effort; the dialog simply stays hidden
    }
  }, []);

  useEffect(() => {
    const onFocus = () => void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    // Deferred (not synchronous in the effect body) so the pending
    // reschedule is picked up right after the app opens from a notification.
    const immediate = window.setTimeout(() => void check(), 0);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      window.clearTimeout(immediate);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [check]);

  const close = useCallback(async () => {
    try {
      await clearPendingReschedule();
    } catch {
      // best-effort
    }
    setPending(null);
    setError("");
    setSaved(false);
  }, []);

  // Hardware back closes the dialog instead of exiting the app.
  useModalBackHandler(pending !== null, () => void close());

  async function save() {
    if (!pending) return;
    if (pending.dateKey !== todayKey()) {
      // Stale pending entry from a previous day: drop it.
      await close();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const scheduled = await rescheduleReminder(pending.habitId, pending.dateKey, newTime);
      if (!scheduled) {
        setError("That time has already passed today. Pick a later time.");
        return;
      }
      await clearPendingReschedule();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reschedule the reminder.");
    } finally {
      setSaving(false);
    }
  }

  if (!pending || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Reschedule reminder">
      <div className="theme-sheet-backdrop absolute inset-0 h-full w-full" />
      <div className="theme-sheet-panel absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-[2rem] border-t border-line bg-surface p-6 pb-[calc(env(safe-area-inset-bottom)+80px)] shadow-lift">
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-line" />

        {saved ? (
          <div className="text-center">
            <p className="eyebrow">Rescheduled</p>
            <p className="mt-2 font-serif text-2xl text-ink">
              {pending.title} at {formatTime(newTime)}
            </p>
            <p className="mt-2 text-sm text-muted">
              You&apos;ll be reminded again at the new time, with Done / Reschedule actions.
            </p>
            <button type="button" onClick={() => void close()} className="btn-primary mt-5 w-full">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="eyebrow">Reschedule reminder</p>
              <p className="font-serif text-2xl text-ink">{pending.title || "Habit reminder"}</p>
            </div>
            <p className="mt-2 text-sm text-muted">
              Originally at {pending.timeText ? formatTime(pending.timeText) : "the scheduled time"}.
              Pick a new time for today&apos;s reminder.
            </p>

            <div className="mt-4">
              <TimePickerField value={newTime} onChange={setNewTime} label="New time" />
            </div>

            {error ? <ErrorText message={error} /> : null}

            <div className="mt-5 flex gap-2">
              <button type="button" disabled={saving} onClick={() => void close()} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="btn-primary flex-1"
              >
                {saving ? "Saving..." : "Save new time"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
