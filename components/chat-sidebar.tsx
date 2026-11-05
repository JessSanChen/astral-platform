"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { useConversationStore } from "@/components/conversation-store";
import { ConsoleSwitch } from "@/components/console-switch";

/**
 * A quiet spinner on the conversation being opened.
 *
 * There is deliberately no full-screen loading state: blanking the chat and
 * replacing it with a skeleton on every click was jarring. Without one, the
 * conversation you are reading stays on screen until the next one is ready,
 * and this marks which one is on its way.
 */
function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />;
}

export function ChatSidebar({
  userName,
  isAdmin,
}: {
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  // Read from the client store, so a conversation created a moment ago is
  // already here rather than waiting for the next server render.
  const { conversations } = useConversationStore();
  const submittedCount = conversations.filter(
    (c) => c.status === "submitted",
  ).length;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="space-y-2 p-3">
        <ConsoleSwitch />
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
              // Fetch the conversation before it is clicked. These pages are
              // dynamic, so without this the whole round trip happens after
              // the click and the interface sits still while it waits.
              prefetch={true}
              className={cn(
                "mb-0.5 block rounded-[var(--radius)] px-3 py-2 text-sm hover:bg-muted",
                active && "bg-muted font-medium",
              )}
            >
              <span className="flex items-center gap-2">
                {/* Submitted conversations are marked with a filled dot, so
                    progress is visible at a glance down the list. */}
                <span
                  aria-hidden
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    c.status === "submitted"
                      ? "bg-accent"
                      : "border border-muted-foreground/40",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <PendingDot />
              </span>
              <span className="mt-0.5 block pl-4 text-xs text-muted-foreground">
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
