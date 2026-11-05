"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  MessagesSquare,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/chat", label: "My chats", icon: MessagesSquare },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/nominate", label: "Submit", icon: Trophy },
] as const;

const STORAGE_KEY = "astral.nav.expanded";

/**
 * The index down the far left: which part of the platform you are in.
 *
 * It collapses to icons, since the consoles beside it already carry a list of
 * their own and two full-width columns crowd a laptop screen. The choice is
 * remembered per browser, and reading it can fail in a private window, so a
 * failure just means the default.
 */
export function MasterNav() {
  const pathname = usePathname();
  // Read once when the component first mounts rather than in an effect, so
  // the menu never renders at the wrong width and then jumps.
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === "true";
    } catch {
      // Storage unavailable, as in a private window. The default stands.
      return true;
    }
  });

  function toggle() {
    setExpanded((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Not being able to remember it is not worth failing over.
      }
      return next;
    });
  }

  return (
    <nav
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-muted/60 py-3 transition-[width]",
        expanded ? "w-44" : "w-14",
      )}
    >
      <div className={cn("flex flex-col gap-1", expanded ? "px-2" : "items-center px-2")}>
        {SECTIONS.map((section) => {
          const active =
            section.href === "/chat"
              ? pathname.startsWith("/chat")
              : pathname.startsWith(section.href);
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              prefetch
              title={expanded ? undefined : section.label}
              aria-label={section.label}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-sm transition-colors",
                expanded ? "w-full" : "justify-center",
                active
                  ? "bg-card font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {expanded && <span className="truncate">{section.label}</span>}
            </Link>
          );
        })}
      </div>

      <button
        onClick={toggle}
        aria-label={expanded ? "Collapse menu" : "Expand menu"}
        className={cn(
          "mt-auto flex items-center gap-2 rounded-[var(--radius)] px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
          expanded ? "mx-2" : "mx-2 justify-center",
        )}
      >
        {expanded ? (
          <>
            <ChevronLeft className="h-4 w-4" />
            Collapse
          </>
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    </nav>
  );
}
