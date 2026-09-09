"use client";

import { useId, type ReactNode } from "react";

import { WEEKDAY_LABELS } from "@/lib/constants";
import { parseDateKey } from "@/lib/dates";

/* ---------- Icons ---------- */

type IconProps = {
  className?: string;
  size?: number;
};

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function SunIcon({ className, size = 22 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
    </svg>
  );
}

export function ChartIcon({ className, size = 22 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 20h16" />
      <rect x="6" y="10" width="3" height="7" rx="1" />
      <rect x="11" y="6" width="3" height="11" rx="1" />
      <rect x="16" y="13" width="3" height="4" rx="1" />
    </svg>
  );
}

export function CoachIcon({ className, size = 22 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.5c4.4 0 7.5 3 7.5 7 0 4-3.1 7-7.5 7-1 0-2-.2-2.9-.6L5.5 18l.9-2.9a7 7 0 0 1-1-3.6c0-4 3.1-7 6.6-7Z" />
      <path d="M9 11.5 11 13l4-4" />
    </svg>
  );
}

export function PlusIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ListIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function SparkIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5C9.1 9.9 11.4 7.6 12 3Z" />
    </svg>
  );
}

export function ArrowIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function CalendarIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 2.5V6.5M16 2.5V6.5" />
    </svg>
  );
}

export function SettingsIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8" />
    </svg>
  );
}

export function MoonIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
    </svg>
  );
}

export function SystemIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M9 20h6M12 16v4" />
    </svg>
  );
}

export function LogOutIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" />
      <path d="M17 8l4 4-4 4M9 12h12" />
    </svg>
  );
}

/* ---------- Avatar ---------- */

export function Avatar({
  name,
  size = 44,
  className = "",
}: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = (name ?? "H").trim();
  const letters = initials
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-charcoal font-serif text-paper ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {letters}
    </span>
  );
}

/* ---------- Progress ring ---------- */

export function ProgressRing({
  value,
  size = 88,
  stroke = 9,
  trackClass = "text-line",
  progressClass = "text-accent",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  trackClass?: string;
  progressClass?: string;
  children?: ReactNode;
}) {
  const gradientId = useId();
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          stroke="currentColor"
          className={trackClass}
          color="currentColor"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={progressClass}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.2,0.7,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/* ---------- Chip ---------- */

export function Chip({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`chip ${className}`}>{children}</span>;
}

/* ---------- Date strip ---------- */

export type DayCompletion = {
  done: number;
  scheduled: number;
};

export function DateStrip({
  days,
  selectedKey,
  todayKey,
  completionsByDay,
  onSelect,
}: {
  days: string[];
  selectedKey: string;
  todayKey: string;
  completionsByDay: Record<string, DayCompletion | undefined>;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
      {days.map((key) => {
        const date = parseDateKey(key);
        const weekday = WEEKDAY_LABELS[date.getDay()] ?? "";
        const number = date.getDate();
        const selected = key === selectedKey;
        const isToday = key === todayKey;
        const completions = completionsByDay[key];
        const fullDay =
          completions && completions.scheduled > 0 && completions.done >= completions.scheduled;
        const partialDay =
          completions && completions.scheduled > 0 && completions.done > 0 && !fullDay;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={selected}
            aria-label={`${weekday}, ${number}`}
            className={`group relative flex w-[3.15rem] shrink-0 flex-col items-center gap-1 rounded-[1.15rem] px-1 py-2.5 transition-all duration-200 ${
              selected
                ? "scale-[1.06] bg-accent text-white shadow-lift"
                : "border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {weekday}
            </span>
            <span className="text-base font-semibold leading-none">{number}</span>

            {isToday ? (
              <span
                className={`text-[8px] font-bold uppercase tracking-wide ${
                  selected ? "text-white/80" : "text-accent"
                }`}
              >
                Today
              </span>
            ) : (
              <span className="flex h-[10px] items-center">
                {fullDay ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                ) : partialDay ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                ) : null}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}