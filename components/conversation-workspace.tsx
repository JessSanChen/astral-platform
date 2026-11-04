"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { Tag, X } from "lucide-react";
import { ChatView } from "@/components/chat-view";
import { LabelsPanel, type LabelValues, type TurnOption } from "@/components/labels-panel";
import { Button } from "@/components/ui/button";
import type { ModelOption } from "@/lib/models";
import { cn } from "@/lib/utils";

/**
 * Puts the conversation and its labels side by side. The panel can be closed
 * so the chat has the full width, which matters on a laptop screen.
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
  const [open, setOpen] = useState(true);

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
          conversationStatus={props.status}
          currentVersion={props.currentVersion}
          labelsOpen={open}
          onToggleLabels={() => setOpen((o) => !o)}
        />
      </div>

      <aside
        className={cn(
          "shrink-0 border-l border-border bg-muted/20 transition-all",
          open ? "w-96" : "w-0 overflow-hidden",
        )}
      >
        {open && (
          <div className="relative h-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 z-10"
              aria-label="Close labels"
            >
              <X className="h-4 w-4" />
            </Button>
            <LabelsPanel
              // Remounting on a new version makes the panel adopt whatever
              // the server stored, without reaching for an effect. While a
              // participant is still editing the version does not change, so
              // their in-progress answers are never thrown away.
              key={`v${props.currentVersion}`}
              conversationId={props.conversationId}
              labels={props.labels}
              turns={props.turns}
              status={props.status}
              currentVersion={props.currentVersion}
              hasMessages={props.hasMessages}
              changedSinceSubmit={props.changedSinceSubmit}
            />
          </div>
        )}
      </aside>

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 border-l border-border bg-muted/20 px-3 text-xs font-medium hover:bg-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          <Tag className="h-3.5 w-3.5" />
          Labels
        </button>
      )}
    </div>
  );
}
