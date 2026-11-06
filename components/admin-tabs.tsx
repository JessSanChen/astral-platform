"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/nominations", label: "Nominations" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            className={cn(
              "rounded-[var(--radius)] px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
