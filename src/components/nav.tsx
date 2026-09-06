import Link from "next/link";

import type { ReactNode } from "react";

type Props = {
  href: string;
  label: string;
  icon: ReactNode;
  current?: boolean;
};

export function NavItem({ href, label, icon, current }: Props) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-full px-3 py-2.5 transition-colors duration-200 ${
        current
          ? "bg-surface text-ink shadow-soft"
          : "text-white/55 hover:text-white"
      }`}
    >
      <span className={current ? "text-accent" : ""}>{icon}</span>
      <span className="text-[11px] font-semibold leading-none">{label}</span>
    </Link>
  );
}