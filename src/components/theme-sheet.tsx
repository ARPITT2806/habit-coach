"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { LogOutIcon, MoonIcon, SunIcon, SystemIcon } from "@/components/ui";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "habitcoach.theme";

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return preference;
}

function readStored(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function ThemeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    return readStored();
  });
  const [confirming, setConfirming] = useState(false);

  const apply = useCallback((next: ThemePreference) => {
    document.documentElement.setAttribute("data-theme", resolveTheme(next));
  }, []);

  useEffect(() => {
    apply(readStored());
  }, [apply]);

  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [apply, preference]);

  const dismiss = useCallback(() => {
    setConfirming(false);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    if (open) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [open, dismiss]);

  if (!open) return null;

  function select(next: ThemePreference) {
    setPreference(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  const options: Array<{
    value: ThemePreference;
    label: string;
    icon: ReactNode;
  }> = [
    { value: "light", label: "Light", icon: <SunIcon size={19} /> },
    { value: "dark", label: "Dark", icon: <MoonIcon size={19} /> },
    {
      value: "system",
      label: "Follow system",
      icon: <SystemIcon size={19} />,
    },
  ];

  async function handleSignOut() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    dismiss();
    router.replace("/login");
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close settings"
        onClick={dismiss}
        className="theme-sheet-backdrop absolute inset-0 h-full w-full"
      />

      <div className="theme-sheet-panel absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-[2rem] border-t border-line bg-surface p-6 shadow-lift">
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-line" />

        <div className="flex items-center justify-between">
          <p className="eyebrow">Settings</p>
          <button
            type="button"
            onClick={dismiss}
            className="icon-btn h-9 w-9 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-ink">Appearance</p>
          <div className="mt-3 space-y-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={preference === option.value}
                onClick={() => select(option.value)}
                className="theme-option"
              >
                <span className="shrink-0 text-muted">{option.icon}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="my-5 h-px bg-line" />

        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="theme-option"
        >
          <span className="shrink-0 text-muted">
            <LogOutIcon size={19} />
          </span>
          {confirming ? "Tap again to sign out" : "Sign out"}
          <span className="ml-auto text-xs font-medium text-muted">
            local profile
          </span>
        </button>

        <p className="mt-4 text-center text-xs text-muted">
          Signing out returns you to the sign-in screen. Your tracked habits
          stay saved on this device.
        </p>
      </div>
    </div>
  );
}