"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ReviewPanel, type ReviewValues } from "@/components/review-panel";
import type { ReviewableTranscript } from "@/lib/reviews";
import { cn } from "@/lib/utils";

/**
 * A transcript as a reviewer sees it: the conversation, nothing else.
 *
 * No author, no submission time, and none of the author's own labels. The
 * value of an independent review comes from the reviewer judging what is in
 * front of them rather than agreeing with a description they were shown.
 */
export function ReviewWorkspace({
  transcript,
  existing,
  alreadyReviewed,
  submissionCount,
}: {
  transcript: ReviewableTranscript;
  existing: ReviewValues;
  alreadyReviewed: boolean;
  submissionCount: number;
}) {
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <span className="text-sm font-medium">Transcript for review</span>
          <span className="text-xs text-muted-foreground">
            {transcript.turns.length} turn
            {transcript.turns.length === 1 ? "" : "s"} · {transcript.modelId}
          </span>
        </header>

        {transcript.scenario && (
          <div className="border-b border-border bg-muted/50 px-4 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              Scenario the author set
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">
              {transcript.scenario}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {transcript.turns.map((turn, i) => (
              <Turn key={turn.seq} turn={turn} index={i + 1} />
            ))}
          </div>
        </div>
      </div>

      <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-muted/20">
        <ReviewPanel
          key={transcript.conversationId}
          conversationId={transcript.conversationId}
          existing={existing}
          alreadyReviewed={alreadyReviewed}
          submissionCount={submissionCount}
        />
      </aside>
    </div>
  );
}

function Turn({
  turn,
  index,
}: {
  turn: { role: "user" | "assistant"; content: string };
  index: number;
}) {
  const isUser = turn.role === "user";
  const empty = turn.content.trim().length === 0;

  return (
    <div
      className={cn(
        "flex items-start gap-2",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <span className="mt-2.5 w-7 shrink-0 text-right font-mono text-xs text-muted-foreground">
          [{index}]
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : empty
              ? "border border-dashed border-border bg-muted/40"
              : "border border-border bg-card",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{turn.content}</p>
        ) : empty ? (
          <p className="italic text-muted-foreground">
            No reply. The model refused or was blocked.
          </p>
        ) : (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {turn.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {isUser && (
        <span className="mt-2.5 w-7 shrink-0 font-mono text-xs text-muted-foreground">
          [{index}]
        </span>
      )}
    </div>
  );
}
