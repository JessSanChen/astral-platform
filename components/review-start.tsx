"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, GitCompareArrows } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getNextAssignment } from "@/app/review/actions";
import { Button } from "@/components/ui/button";
import { COMPARISON_INSTRUCTIONS } from "@/lib/review-form";

type Kind = "primary" | "pair_audit";

const NOTHING: Record<Kind, string> = {
  primary:
    "There is nothing for you to review right now. Records become available as people submit them, and you are never given your own work or two things from the same piece of work. Try again in a little while.",
  pair_audit: "There is no pair for you to compare right now. Try again in a little while.",
};

/**
 * The two kinds of review, side by side and equal: a transcript review
 * and a comparison of two related conversations. Each has its own button,
 * its own counts and, always in view beneath it, its own instructions.
 *
 * The buttons read the same whatever has gone before. If one of that kind
 * was left half done, the button opens it, with what had been filled in;
 * otherwise it fetches a new one. One kind being in progress does not
 * close the other.
 */
export function ReviewStart({
  reviewInstructions,
  reviewInstructionsVersion,
  reviewInProgress,
  comparisonInProgress,
  reviewed,
  compared,
  skippedReviews,
  skippedComparisons,
}: {
  reviewInstructions: string;
  reviewInstructionsVersion: number;
  reviewInProgress: boolean;
  comparisonInProgress: boolean;
  reviewed: number;
  compared: number;
  skippedReviews: number;
  skippedComparisons: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<Kind | null>(null);
  const [note, setNote] = useState<{ kind: Kind; text: string } | null>(null);

  // Coming back here from a record (Pause, Stop for now) can show the page
  // as it was before that record was opened. Ask for it afresh.
  useEffect(() => {
    router.refresh();
  }, [router]);

  function ask(kind: Kind) {
    setNote(null);
    setAsking(kind);
    start(async () => {
      const result = await getNextAssignment(kind);
      if (!result.ok) return setNote({ kind, text: result.message });
      if (!result.assignmentId) return setNote({ kind, text: NOTHING[kind] });
      router.push(`/review/${result.assignmentId}`);
    });
  }

  const columns: {
    kind: Kind;
    icon: ReactNode;
    title: string;
    about: string;
    button: string;
    inProgress: boolean;
    done: number;
    skipped: number;
    instructionsLabel: string;
    instructions: string;
  }[] = [
    {
      kind: "primary",
      icon: <ClipboardCheck className="h-4 w-4" />,
      title: "Transcript review",
      about: "One conversation, or several linked sessions, and one form.",
      button: "Get a review",
      inProgress: reviewInProgress,
      done: reviewed,
      skipped: skippedReviews,
      instructionsLabel: `Transcript review instructions (version ${reviewInstructionsVersion})`,
      instructions: reviewInstructions,
    },
    {
      kind: "pair_audit",
      icon: <GitCompareArrows className="h-4 w-4" />,
      title: "Comparison",
      about: "Two related conversations side by side, and one form.",
      button: "Compare two versions",
      inProgress: comparisonInProgress,
      done: compared,
      skipped: skippedComparisons,
      instructionsLabel: "Comparison instructions",
      instructions: COMPARISON_INSTRUCTIONS,
    },
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {columns.map((c) => (
        <section
          key={c.kind}
          aria-label={c.title}
          className="space-y-4 rounded-[var(--radius)] border border-border bg-card px-5 py-5"
        >
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 font-serif text-xl font-medium">
              {c.icon}
              {c.title}
            </h2>
            <p className="text-sm text-muted-foreground">{c.about}</p>
          </div>
          <div className="space-y-2">
            <Button size="lg" className="w-full" disabled={pending} onClick={() => ask(c.kind)}>
              {pending && asking === c.kind ? "Opening..." : c.button}
            </Button>
            <p className="text-xs text-muted-foreground">
              {c.done} completed · {c.skipped} skipped
              {c.inProgress && " · 1 in progress: the button opens it, with what you had filled in"}
            </p>
            {note?.kind === c.kind && (
              <p role="status" className="rounded-[var(--radius)] bg-muted px-3 py-2 text-sm">
                {note.text}
              </p>
            )}
          </div>
          <div
            role="group"
            aria-label={c.instructionsLabel}
            className="space-y-2 border-t border-border pt-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {c.instructionsLabel}
            </p>
            <div className="markdown text-sm leading-relaxed">
              <ReactMarkdown>{c.instructions}</ReactMarkdown>
            </div>
          </div>
        </section>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground lg:col-span-2">
        The two are different kinds of review and are counted separately. You
        can have one of each in progress, and pause either and come back. You
        are never given both for the same work. Skipping something outside
        your expertise is the right thing to do and is never counted against
        you.
      </p>
    </div>
  );
}
