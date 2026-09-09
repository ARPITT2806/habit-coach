"use client";

import { useEffect, useRef } from "react";

/**
 * Coherent Android/back-button strategy for Habitiva's state-driven modals.
 *
 * Root cause of the reported bug: modals (Add Habit, Edit Habit, the time
 * picker) are React state, not routes, so they add nothing to the WebView
 * history. A hardware back press therefore skips the modal and either goes
 * to the previous route or exits the single-activity app entirely.
 *
 * Fix: while a modal is open, push one dummy history entry. A back press
 * pops that entry, and the popstate listener closes the topmost modal
 * instead of leaving the app. Nested modals (time picker inside Add Habit)
 * stack naturally: each pushes its own entry, so backs unwind one layer at
 * a time. When the modal closes via its own SAVE/Cancel button, the cleanup
 * pops the dummy entry it pushed. At the root with no modal open there is
 * no handler, so the platform's normal exit behavior is preserved.
 */
export function useModalBackHandler(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    window.history.pushState({ habitivaModal: true }, "");

    let settled = false;
    const onPopState = () => {
      if (settled) return;
      settled = true;
      onCloseRef.current();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!settled) {
        settled = true;
        // Closed via UI, not via back: withdraw the dummy entry we pushed.
        window.history.back();
      }
    };
  }, [open ]);
}
