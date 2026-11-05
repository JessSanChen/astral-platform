"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { PanelRightClose, ShieldCheck, Tag } from "lucide-react";
import { ChatView } from "@/components/chat-view";
import { JudgeTab } from "@/components/judge-tab";
import { LabelsPanel, type LabelValues, type TurnOption } from "@/components/labels-panel";
import { useConversationStore } from "@/components/conversation-store";
import { Button } from "@/components/ui/button";
import type { ModelOption } from "@/lib/models";
import { cn } from "@/lib/utils";

/**
 * The conversation with its side panel. The panel has two tabs: the labels
 * for this conversation, and the safety scanners. Keeping them together
 * means one panel on one side rather than things appearing from opposite
 * edges. Which tab is open, and the scanner results, live in the shared
 * store, so they survive moving between conversations.
 */
export function ConversationWorkspace(props: {
  conversationId: string;
  modelId: string;
  scenario: string | null;
  models: ModelOption[];
  initialMessages: UIMessage[];
  locked: boolean;
  status: "draft" | "submitted";
  currentVersion: number;
  changedSinceSubmit: boolean;
  hasMessages: boolean;
  labels: LabelValues;
  turns: TurnOption[];
}) {
  const store = useConversationStore();
  const { rightTab, setRightTab, rightPanelOpen, setRightPanelOpen } = store;

  // Share the conversation's chat, so the panel knows what is on screen now
  // rather than what the server rendered. A conversation first opened empty
  // and then written in would otherwise still claim it had no messages.
  const chat = store.getChat(props.conversationId, props.initialMessages);
  const { messages } = useChat({ chat });
  const hasMessages = messages.length > 0;

  // Prefer the client's view of status: it reflects a submit made a moment
  // ago, where the server-rendered copy may predate it.
  const entry = store.conversations.find((c) => c.id === props.conversationId);
  const status = entry?.status ?? props.status;
  const currentVersion = entry?.currentVersion ?? props.currentVersion;

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <ChatView
          conversationId={props.conversationId}
          modelId={props.modelId}
          scenario={props.scenario}
          models={props.models}
          initialMessages={props.initialMessages}
          locked={props.locked}
          conversationStatus={status}
          currentVersion={currentVersion}
          labelsOpen={rightPanelOpen}
          onToggleLabels={() => setRightPanelOpen(true)}
        />
      </div>

      {rightPanelOpen && (
        <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-muted/20">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <TabButton
              active={rightTab === "labels"}
              onClick={() => setRightTab("labels")}
              icon={<Tag className="h-3.5 w-3.5" />}
              label="Labels"
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
            {rightTab === "labels" ? (
              <LabelsPanel
                key={`v${currentVersion}`}
                conversationId={props.conversationId}
                labels={props.labels}
                turns={props.turns}
                status={status}
                currentVersion={currentVersion}
                hasMessages={hasMessages}
                changedSinceSubmit={props.changedSinceSubmit}
              />
            ) : (
              <JudgeTab conversationId={props.conversationId} />
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
