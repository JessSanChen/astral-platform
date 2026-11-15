"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Folder, GitCompareArrows, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useConversationStore,
  type StoredConversation,
} from "@/components/conversation-store";
import { ConversationMenu } from "@/components/rename-conversation";

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

/**
 * "My work": every conversation and folder of the participant's own.
 *
 * A folder is shown as a heading with its sessions under it. Each session
 * is its own chat; being in the same folder does not let one see another.
 */
export function ChatSidebar() {
  const pathname = usePathname();
  // Read from the client store, so something created a moment ago is
  // already here rather than waiting for the next server render.
  const { conversations } = useConversationStore();

  // Episodes in the order their first session appears, sessions in order.
  const episodes: { id: string; sessions: StoredConversation[] }[] = [];
  const byId = new Map<string, StoredConversation[]>();
  for (const c of conversations) {
    let list = byId.get(c.episodeId);
    if (!list) {
      list = [];
      byId.set(c.episodeId, list);
      episodes.push({ id: c.episodeId, sessions: list });
    }
    list.push(c);
  }
  for (const e of episodes) e.sessions.sort((a, b) => a.sessionOrder - b.sessionOrder);
  const submitted = episodes.filter((e) => e.sessions[0]?.episodeStatus === "submitted").length;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="p-3">
        <Link
          href="/chat"
          className="flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border bg-card px-2 py-2 text-sm font-medium hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>

      <nav aria-label="My work" className="relative flex-1 overflow-y-auto px-2 pb-2">
        {episodes.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Nothing yet. Start a conversation, or a folder for several related
            ones.
          </p>
        )}
        {episodes.map((e) => {
          const first = e.sessions[0];
          if (!first.isFolder) {
            return (
              <SessionLink
                key={e.id}
                session={first}
                label={first.title}
                active={pathname === `/chat/${first.id}`}
                note={first.episodeStatus === "submitted" ? "Submitted" : "Not submitted"}
              />
            );
          }
          return (
            <div key={e.id} className="mb-2 mt-1.5">
              {/* The folder's own row: plainly something to click, with
                  whether the folder itself has been submitted. Its page
                  has the folder's questions and the way to submit it. */}
              <Link
                href={`/chat/folder/${e.id}`}
                aria-current={pathname === `/chat/folder/${e.id}` ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm hover:border-accent/60 hover:bg-muted",
                  pathname === `/chat/folder/${e.id}` && "border-accent/60 bg-muted",
                )}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{first.episodeTitle}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    first.episodeStatus === "submitted"
                      ? "bg-accent/15 text-accent"
                      : "border border-border text-muted-foreground",
                  )}
                >
                  {first.episodeStatus === "submitted" ? "Submitted" : "Not submitted"}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
              <div className="ml-3 mt-0.5 border-l border-border pl-1">
                {e.sessions.map((s) => (
                  <SessionLink
                    key={s.id}
                    session={s}
                    label={
                      s.title === "New conversation"
                        ? `Session ${s.sessionOrder}`
                        : `${s.sessionOrder}. ${s.title}`
                    }
                    active={pathname === `/chat/${s.id}`}
                    // A session sent in by itself, ahead of its folder.
                    note={
                      s.status === "submitted" && s.episodeStatus !== "submitted"
                        ? "Submitted by itself"
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          {submitted} submitted
        </p>
      </div>
    </aside>
  );
}

function SessionLink({
  session,
  label,
  active,
  note,
}: {
  session: StoredConversation;
  label: string;
  active: boolean;
  note?: string;
}) {
  return (
    <div
      className={cn(
        "group/item relative mb-0.5 rounded-[var(--radius)] hover:bg-muted",
        active && "bg-muted",
      )}
    >
      <Link
        href={`/chat/${session.id}`}
        // Fetch the conversation before it is clicked. These pages are
        // dynamic, so without this the whole round trip happens after the
        // click and the interface sits still while it waits.
        prefetch={true}
        className={cn("block rounded-[var(--radius)] px-3 py-2 text-sm", active && "font-medium")}
      >
        <span className="flex items-center gap-2">
          {/* Submitted work is marked with a filled dot, so progress is
              visible at a glance down the list. */}
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              session.status === "submitted" || session.episodeStatus === "submitted"
                ? "bg-accent"
                : "border border-muted-foreground/40",
            )}
          />
          {/* Room for the menu button, which sits on top rather than
              inside the link: a button inside a link is invalid and
              swallows clicks meant for either one. */}
          <span className="min-w-0 flex-1 truncate pr-6">{label}</span>
          {session.related && (
            <span title="A related version of earlier work">
              <GitCompareArrows className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </span>
          )}
          <PendingDot />
        </span>
        {note && (
          <span className="mt-0.5 block pl-4 text-xs text-muted-foreground">{note}</span>
        )}
      </Link>
      {session.episodeStatus === "draft" && session.status !== "submitted" && (
        <ConversationMenu conversationId={session.id} title={session.title} />
      )}
    </div>
  );
}
