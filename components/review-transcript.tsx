"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ViewContent, ViewTurn } from "@/lib/episodes";
import { cn } from "@/lib/utils";

/**
 * A frozen record as a reviewer sees it: the turns, numbered, and nothing
 * about who wrote it or what they meant by it.
 *
 * With `onToggle`, the numbers beside the user's messages are buttons:
 * clicking one marks that message as something the reviewer's judgment
 * rests on. The assistant's turns are never buttons: what the assistant
 * did is context, not evidence about the user.
 */
export function ReviewTranscript({
  content,
  selected,
  onToggle,
  label,
}: {
  content: ViewContent;
  selected?: number[];
  onToggle?: (n: number) => void;
  label?: string;
}) {
  const linked = content.kind === "linked";
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6" aria-label={label}>
      {content.turns.length === 0 && (
        <p className="text-sm italic text-muted-foreground">This record has no turns.</p>
      )}
      {content.turns.map((turn, i) => {
        const previous = content.turns[i - 1];
        const newSession = linked && turn.session !== previous?.session;
        return (
          <div key={turn.n} className="space-y-5">
            {newSession && (
              <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                Session {turn.session}
                <span className="h-px flex-1 bg-border" />
              </p>
            )}
            <Turn
              turn={turn}
              picked={selected?.includes(turn.n) ?? false}
              onToggle={onToggle}
            />
          </div>
        );
      })}
    </div>
  );
}

function Turn({
  turn,
  picked,
  onToggle,
}: {
  turn: ViewTurn;
  picked: boolean;
  onToggle?: (n: number) => void;
}) {
  const isUser = turn.role === "user";
  const empty = turn.content.trim().length === 0;
  const cut = !isUser && !empty && turn.finishReason === "aborted";

  const number = onToggle && isUser ? (
    <button
      type="button"
      aria-pressed={picked}
      aria-label={`Turn ${turn.n}`}
      title={picked ? "Marked as relevant. Click to unmark." : "Mark this turn as relevant"}
      onClick={() => onToggle(turn.n)}
      className={cn(
        "mt-2 h-6 min-w-8 shrink-0 rounded-full border px-1.5 font-mono text-xs transition-colors",
        picked
          ? "border-accent bg-accent text-white"
          : "border-border text-muted-foreground hover:border-accent hover:text-foreground",
      )}
    >
      {turn.n}
    </button>
  ) : (
    <span className="mt-2.5 min-w-8 shrink-0 text-center font-mono text-xs text-muted-foreground">
      {turn.n}
    </span>
  );

  return (
    <div
      data-turn={turn.n}
      data-role={turn.role}
      data-clip="message"
      className={cn("flex items-start gap-2", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && number}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : empty
              ? "border border-dashed border-border bg-muted/40"
              : "border border-border bg-card",
          picked && "ring-2 ring-accent/60",
        )}
      >
        <p className={cn("mb-1 text-[11px] font-medium uppercase tracking-wide", isUser ? "opacity-70" : "text-muted-foreground")}>
          {isUser ? "User" : "Assistant"}
        </p>
        {isUser ? (
          <p className="whitespace-pre-wrap">{turn.content}</p>
        ) : empty ? (
          <p className="italic text-muted-foreground">
            {turn.failed
              ? "No reply: the request failed or was blocked."
              : "No reply text was returned."}
          </p>
        ) : (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
          </div>
        )}
        {cut && (
          <p className="mt-1 text-xs italic text-muted-foreground">The reply was cut short here.</p>
        )}
      </div>
      {isUser && number}
    </div>
  );
}
