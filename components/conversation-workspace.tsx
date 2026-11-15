"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { ChatView } from "@/components/chat-view";
import { EpisodePanel, type EpisodeInfo } from "@/components/episode-panel";
import { useConversationStore } from "@/components/conversation-store";
import { useClipboardLog } from "@/components/clipboard-log";
import type { ModelOption } from "@/lib/models";

/**
 * One session with the panel beside it. The chat is the session; the panel
 * is about the episode it belongs to: its goal note, its other sessions,
 * submitting it, and making a related version of it.
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
  const { rightPanelOpen, setRightPanelOpen } = store;
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
          <EpisodePanel
            // A panel per episode: moving between two folders must not
            // carry one's half-typed goal note into the other.
            key={props.episode.id}
            episode={{ ...props.episode, status: submitted ? "submitted" : "draft" }}
            currentSessionId={conversationId}
            currentHasMessages={hasMessages}
            busy={busy}
            onClose={() => setRightPanelOpen(false)}
          />
        </aside>
      )}
    </div>
  );
}
