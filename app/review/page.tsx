import { ClipboardCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { requireOnboarded } from "@/lib/gate";
import { reviewerSummary } from "@/lib/assignments";
import { InstructionCheck } from "@/components/instruction-check";
import { ReviewStart } from "@/components/review-start";

/**
 * Where reviewing starts (specification 5.4 and form R).
 *
 * First the shared review instructions and five questions about them.
 * After that,
 * one item of each kind at a time, chosen for the reviewer: there is no
 * list to browse and no way to swap an item for another except by saying
 * why.
 */
export default async function ReviewHome() {
  const { user } = await requireOnboarded();
  const summary = await reviewerSummary(user.id);

  return (
    <div
      className={
        summary.policyReady
          ? "mx-auto max-w-5xl space-y-8 px-6 py-12"
          : "mx-auto max-w-2xl space-y-8 px-6 py-12"
      }
    >
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 font-serif text-3xl font-medium tracking-tight">
          <ClipboardCheck className="h-5 w-5" />
          Review
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          There are two kinds of review, each with its own instructions
          below. In a transcript review you are given one record that
          someone else submitted, without their name or anything they wrote
          about it. In a comparison you are given two related conversations
          side by side. You can have one of each in progress.
        </p>
      </div>

      {summary.policyReady ? (
        <ReviewStart
          reviewInstructions={summary.policy.body}
          reviewInstructionsVersion={summary.policy.version}
          reviewInProgress={Boolean(summary.active.primary)}
          comparisonInProgress={Boolean(summary.active.pair_audit)}
          reviewed={summary.reviewed}
          compared={summary.compared}
          skippedReviews={summary.skippedReviews}
          skippedComparisons={summary.skippedComparisons}
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-serif text-xl font-medium">
              Review instructions
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                version {summary.policy.version}
              </span>
            </h2>
            <div className="markdown rounded-[var(--radius)] border border-border bg-card p-4 text-sm leading-relaxed">
              <ReactMarkdown>{summary.policy.body}</ReactMarkdown>
            </div>
          </section>
          <InstructionCheck />
        </>
      )}
    </div>
  );
}
