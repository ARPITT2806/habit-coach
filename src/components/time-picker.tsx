"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatTime } from "@/lib/dates";
import { useModalBackHandler } from "@/lib/navigation/use-modal-back";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ["AM", "PM"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  const h = match ? Number(match[1]) : 7;
  const m = match ? Number(match[2]) : 0;
  const hour24 = Number.isNaN(h) ? 7 : Math.min(23, Math.max(0, h));
  const minute = Number.isNaN(m) ? 0 : Math.min(59, Math.max(0, m));
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

function toValue(hour12: number, minute: number, period: "AM" | "PM"): string {
  const hour24 = period === "AM" ? hour12 % 12 : hour12 % 12 + 12;
  return `${pad(hour24)}:${pad(minute)}`;
}

function Wheel({
  label,
  values,
  selected,
  onSelect,
  format,
}: {
  label: string;
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
  format: (value: number) => string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-value="${selected}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <span className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="no-scrollbar flex max-h-44 w-full snap-y snap-mandatory flex-col items-center gap-1 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-2/60 p-1.5"
      >
        {values.map((value) => {
          const active = value === selected;
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={active}
              data-value={value}
              onClick={() => onSelect(value)}
              className={`flex min-h-[44px] w-full shrink-0 snap-center items-center justify-center rounded-xl text-base transition-colors ${
                active
                  ? "bg-charcoal font-bold text-white shadow-soft"
                  : "font-medium text-muted hover:text-ink"
              }`}
            >
              {format(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimePickerField({
  value,
  onChange,
  onSave,
  label = "Preferred time",
}: {
  value: string;
  onChange: (value: string) => void;
  onSave?: (newValue: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parseValue(value));
  const doneRef = useRef<HTMLButtonElement>(null);

  const openPicker = useCallback(() => {
    setDraft(parseValue(value));
    setOpen(true);
  }, [value]);

  // Preferred Time → Back returns to the Add/Edit form, never to the home screen.
  useModalBackHandler(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    doneRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open ]);

  const commit = useCallback(() => {
    const newValue = toValue(draft.hour12, draft.minute, draft.period);
    onChange(newValue);
    onSave?.(newValue);
    setOpen(false);
  }, [draft, onChange, onSave]);

  const preview = useMemo(
    () => formatTime(toValue(draft.hour12, draft.minute, draft.period)),
    [draft],
  );

  return (
    <div className="block text-sm text-muted">
      <span>{label}</span>
      <button
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        className="field flex w-full items-center justify-between text-left font-semibold text-ink"
      >
        <span>{formatTime(value)}</span>
        <span aria-hidden="true" className="text-xs font-medium uppercase tracking-wide text-accent">
          Change
        </span>
      </button>

      {open ? (
        createPortal(
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
            <button
              type="button"
              aria-label="Close time picker"
              onClick={() => setOpen(false)}
              className="theme-sheet-backdrop absolute inset-0 h-full w-full"
            />
            <div className="theme-sheet-panel absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-[2rem] border-t border-line bg-surface p-6 pb-[calc(env(safe-area-inset-bottom)+80px)] shadow-lift flex flex-col max-h-[calc(100vh-120px)] max-h-[calc(100dvh-120px)]">
              <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-line flex-shrink-0" />

              <div className="flex items-center justify-between flex-shrink-0">
                <p className="eyebrow">Pick a time</p>
                <p className="font-serif text-2xl text-ink" aria-live="polite">
                  {preview}
                </p>
              </div>

              <div className="mt-5 flex-1 min-h-0 overflow-y-auto flex items-start gap-2">
                <Wheel
                  label="Hour"
                  values={HOURS}
                  selected={draft.hour12}
                  onSelect={(hour12) => setDraft((d) => ({ ...d, hour12 }))}
                  format={(v) => String(v)}
                />
                <Wheel
                  label="Minute"
                  values={MINUTES}
                  selected={draft.minute}
                  onSelect={(minute) => setDraft((d) => ({ ...d, minute }))}
                  format={pad}
                />
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <span className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Period
                  </span>
                  <div className="flex w-full flex-col gap-1.5">
                    {PERIODS.map((period) => {
                      const active = period === draft.period;
                      return (
                        <button
                          key={period}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setDraft((d) => ({ ...d, period }))}
                          className={`flex min-h-[44px] w-full items-center justify-center rounded-xl text-base transition-colors ${
                            active
                              ? "bg-accent font-bold text-white shadow-soft"
                              : "border border-line bg-surface font-medium text-muted"
                          }`}
                        >
                          {period}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-2 flex-shrink-0">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button
                  ref={doneRef}
                  type="button"
                  onClick={commit}
                  className="btn-primary flex-1"
                >
                  SAVE
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      ) : null}
    </div>
  );
}
