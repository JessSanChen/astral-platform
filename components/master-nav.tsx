"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  MessagesSquare,
  PanelLeft,
  Trophy,
} from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
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
 * It collapses to icons, since each console already carries a list of its own
 * and two full-width columns crowd a laptop screen. The choice is remembered
 * per browser; reading that can fail in a private window, so a failure just
 * means the default.
 */
export function MasterNav({
  userName,
  userEmail,
  isAdmin,
}: {
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  // Read once on first render rather than in an effect, so the menu never
  // appears at the wrong width and then jumps.
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });

  function toggle() {
    setExpanded((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Not remembering it is not worth failing over.
      }
      return next;
    });
  }

  return (
    <nav
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-muted/60 transition-[width]",
        expanded ? "w-48" : "w-14",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-3",
          expanded ? "justify-between" : "justify-center",
        )}
      >
        <button
          onClick={toggle}
          aria-label={expanded ? "Collapse menu" : "Expand menu"}
          title={expanded ? "Collapse menu" : "Expand menu"}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {expanded && (
          <Link
            href="/chat"
            className="mr-1 text-sm font-semibold tracking-[0.18em]"
          >
            ASTRAL
          </Link>
        )}
      </div>

      <div className={cn("flex flex-col gap-1 px-2", expanded ? "" : "items-center")}>
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
                expanded ? "w-full" : "h-9 w-9 justify-center px-0",
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

      {/* Who you are acting as. Kept here rather than inside one console,
          because it is true of the whole session: every tab in a browser
          shares it, which is confusing while testing several accounts. */}
      <div className={cn("mt-auto border-t border-border p-2", expanded ? "" : "px-1")}>
        {expanded ? (
          <div className="space-y-2">
            <div className="px-1.5">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              {isAdmin && (
                <p className="mt-0.5 text-xs font-medium text-accent">Organizer</p>
              )}
            </div>
            <SignOutButton className="w-full" />
          </div>
        ) : (
          <div
            title={`${userName} (${userEmail})`}
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-card text-xs font-medium"
          >
            {initials(userName)}
          </div>
        )}
      </div>
    </nav>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
