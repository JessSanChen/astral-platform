"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { ClipboardList, PanelRightClose, ShieldCheck } from "lucide-react";
import { ChatView } from "@/components/chat-view";
import { JudgeTab } from "@/components/judge-tab";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EpisodePanel, type EpisodeInfo } from "@/components/episode-panel";
import { useConversationStore } from "@/components/conversation-store";
import { useClipboardLog } from "@/components/clipboard-log";
import type { ModelOption } from "@/lib/models";

/**
 * One session with the panel beside it. The panel has two tabs. Details
 * is about the piece of work the session belongs to: its sessions, the
 * author's answers about it, submitting it, and making a related version.
 * Scanners runs the safety tools over the conversation on screen. Which
 * tab is open, and the scanner results, live in the shared store, so they
 * survive moving between conversations.
 */
export function ConversationWorkspace(props: {
  conversationId: string;
  title: string;
  modelId: string;
  scenario: string | null;
  models: ModelOption[];
  initialMessages: UIMessage[];
  hasMessages: boolean;
  episode: EpisodeInfo;
}) {
  const store = useConversationStore();
  const { rightPanelOpen, setRightPanelOpen, rightTab, setRightTab } = store;
  const { conversationId } = props;

  // Share the conversation's chat, so the panel knows what is on screen now
  // rather than what the server rendered. A conversation first opened empty
  // and then written in would otherwise still claim it had no messages.
  const chat = store.getChat(conversationId, props.initialMessages);
  const { messages, status: chatStatus } = useChat({ chat });
  const hasMessages = messages.length > 0;
  const busy = chatStatus === "streaming" || chatStatus === "submitted";

  // Prefer the client's view of whether it is submitted: it reflects a
  // submit made a moment ago, where the server-rendered copy may predate it.
  const entry = store.conversations.find((c) => c.id === conversationId);
  const submitted =
    (entry?.episodeStatus ?? props.episode.status) === "submitted";

  const clipboard = useClipboardLog(conversationId);

  return (
    <div className="flex h-full" {...clipboard}>
      <div className="min-w-0 flex-1">
        <ChatView
          conversationId={conversationId}
          modelId={props.modelId}
          scenario={props.scenario}
          models={props.models}
          initialMessages={props.initialMessages}
          title={entry?.title ?? props.title}
          locked={hasMessages}
          submitted={submitted}
          panelOpen={rightPanelOpen}
          onOpenPanel={() => setRightPanelOpen(true)}
        />
      </div>

      {rightPanelOpen && (
        <aside
          data-clip="other"
          className="flex w-96 shrink-0 flex-col border-l border-border bg-muted/20"
        >
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <TabButton
              active={rightTab === "details"}
              onClick={() => setRightTab("details")}
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="Details"
            />
            <TabButton
              active={rightTab === "scanners"}
              onClick={() => setRightTab("scanners")}
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Scanners"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRightPanelOpen(false)}
              className="ml-auto"
              aria-label="Close panel"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            {rightTab === "scanners" ? (
              <JudgeTab conversationId={conversationId} />
            ) : (
          <EpisodePanel
            // A panel per episode: moving between two folders must not
            // carry one's half-typed goal note into the other.
            key={props.episode.isFolder ? conversationId : props.episode.id}
            episode={{ ...props.episode, status: submitted ? "submitted" : "draft" }}
            currentSessionId={conversationId}
            currentHasMessages={hasMessages}
            busy={busy}
          />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 text-sm transition-colors",
        active ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
