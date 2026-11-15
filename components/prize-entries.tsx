"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Folder, GitCompareArrows, MessageSquare } from "lucide-react";
import { setPrizeEntryAction } from "@/app/chat/episode-actions";
import { Button } from "@/components/ui/button";

export type PrizeCandidate = {
  id: string;
  title: string;
  isFolder: boolean;
  sessions: number;
  related: boolean;
  entered: boolean;
  /** The first session, to open the work; null if it somehow has none. */
  sessionId: string | null;
  /** When it was submitted, already written out in event time. */
  submitted: string | null;
};

/**
 * The participant's submitted work, each piece with one control: enter it,
 * or take it back. Once entries are closed the list is what was entered and
 * the control is gone.
 */
export function PrizeEntries({
  work,
  used,
  max,
  closed,
}: {
  work: PrizeCandidate[];
  used: number;
  max: number;
  closed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);

  function toggle(id: string, next: boolean) {
    setProblem(null);
    setBusy(id);
    start(async () => {
      const result = await setPrizeEntryAction(id, next);
      if (!result.ok) setProblem({ id, message: result.message });
      // Either way, show what the server now holds: on a refusal that is
      // how a page left open learns entries have closed.
      router.refresh();
      setBusy(null);
    });
  }

  return (
    <div className="mt-8 space-y-3">
      <p className="text-sm font-medium tabular-nums" data-testid="prize-count">
        {used} of {max} entries used
      </p>

      <ul className="space-y-3">
        {work.map((w) => {
          const Icon = w.isFolder ? Folder : MessageSquare;
          const kind = w.isFolder
            ? `Folder, ${w.sessions} session${w.sessions === 1 ? "" : "s"}`
            : "Conversation";
          return (
            <li
              key={w.id}
              className="rounded-[var(--radius)] border border-border bg-card p-4"
              data-entered={w.entered}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-medium">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {w.sessionId ? (
                      <Link
                        href={`/chat/${w.sessionId}`}
                        className="truncate underline-offset-2 hover:underline"
                      >
                        {w.title}
                      </Link>
                    ) : (
                      <span className="truncate">{w.title}</span>
                    )}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{kind}</span>
                    {w.related && (
                      <span className="inline-flex items-center gap-1">
                        <GitCompareArrows className="h-3.5 w-3.5" />
                        Related version
                      </span>
                    )}
                    {w.submitted && <span>Submitted {w.submitted}</span>}
                  </p>
                </div>
                {w.entered && (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Entered
                  </span>
                )}
              </div>

              {!closed && (
                <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
                  {w.entered ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => toggle(w.id, false)}
                    >
                      {busy === w.id ? "Taking back..." : "Take back"}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={pending} onClick={() => toggle(w.id, true)}>
                      {busy === w.id ? "Entering..." : "Enter for a prize"}
                    </Button>
                  )}
                  {w.related && !w.entered && (
                    <span className="text-xs text-muted-foreground">
                      Counts as one entry together with the work it was made from.
                    </span>
                  )}
                </div>
              )}
              {problem?.id === w.id && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {problem.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
