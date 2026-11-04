"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

export type SidebarConversation = {
  id: string;
  title: string;
  status: "draft" | "submitted";
  currentVersion: number;
};

export function ChatSidebar({
  conversations,
  submittedCount,
  userName,
  isAdmin,
}: {
  conversations: SidebarConversation[];
  submittedCount: number;
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="p-3">
        <Link href="/chat">
          <span
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted",
            )}
          >
            <Plus className="h-4 w-4" />
            New conversation
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No conversations yet.
          </p>
        )}
        {conversations.map((c) => {
          const active = pathname === `/chat/${c.id}`;
          return (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className={cn(
                "mb-0.5 block rounded-[var(--radius)] px-3 py-2 text-sm hover:bg-muted",
                active && "bg-muted font-medium",
              )}
            >
              <span className="block truncate">{c.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {c.status === "submitted"
                  ? `Submitted v${c.currentVersion}`
                  : "Draft"}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          {submittedCount} transcript{submittedCount === 1 ? "" : "s"} submitted
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {userName}
            {isAdmin && " (admin)"}
          </span>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
