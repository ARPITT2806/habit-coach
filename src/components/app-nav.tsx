"use client";

import { usePathname } from "next/navigation";

import { NavItem } from "@/components/nav";
import { ChartIcon, CoachIcon, SunIcon } from "@/components/ui";

export function AppNav() {
  const path = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-6"
    >
      <div className="pointer-events-auto flex w-full max-w-[340px] items-center gap-1 rounded-full bg-ink p-2 shadow-nav">
        <NavItem
          href="/today"
          label="Today"
          icon={<SunIcon size={20} />}
          current={path.startsWith("/today")}
        />
        <NavItem
          href="/insights"
          label="Insights"
          icon={<ChartIcon size={20} />}
          current={path.startsWith("/insights")}
        />
        <NavItem
          href="/coach"
          label="Coach"
          icon={<CoachIcon size={20} />}
          current={path.startsWith("/coach")}
        />
      </div>
    </nav>
  );
}