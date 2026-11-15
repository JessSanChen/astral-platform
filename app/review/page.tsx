import { ClipboardCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { requireOnboarded } from "@/lib/gate";
import { nothingMessage, reviewerSummary, whyNothing } from "@/lib/assignments";
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
export default async function ReviewHome({
  searchParams,
}: {
  searchParams: Promise<{ recorded?: string; skipped?: string }>;
}) {
  const { user } = await requireOnboarded();
  const [summary, { recorded, skipped }] = await Promise.all([reviewerSummary(user.id), searchParams]);

  // Arrived here from a record just finished or skipped, because there
  // was no next one to go straight on to: say so, and why.
  const after = recorded ?? skipped;
  const purpose = after === "primary" || after === "pair_audit" ? after : null;
  const done = purpose
    ? {
        what: skipped
          ? "Skipped, with your reason. Nothing else was recorded for it."
          : purpose === "primary"
            ? "Your review was recorded. You can open it again from the list on the left."
            : "Your comparison was recorded. You can open it again from the list on the left.",
        why: nothingMessage(purpose, await whyNothing(user.id, purpose)),
      }
    : null;

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

      {done && (
        <div
          role="status"
          className="space-y-1 rounded-[var(--radius)] border border-accent/40 bg-accent/5 px-4 py-3 text-sm"
        >
          <p className="font-medium">{done.what}</p>
          <p className="text-muted-foreground">{done.why}</p>
        </div>
      )}

      {summary.policyReady ? (
        <ReviewStart
          reviewInstructions={summary.policy.body}
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
