"use client";

import { usePathname } from "next/navigation";
import { NavItem } from "@/components/nav";

export function AppNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-lg gap-1 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur"
    >
      <NavItem href="/today" label="Today" current={path.startsWith("/today")} />
      <NavItem href="/insights" label="Insights" current={path.startsWith("/insights")} />
      <NavItem href="/coach" label="Coach" current={path.startsWith("/coach")} />
    </nav>
  );
}
