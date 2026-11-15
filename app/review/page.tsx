import { ClipboardCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { requireOnboarded } from "@/lib/gate";
import { reviewerSummary } from "@/lib/assignments";
import { InstructionCheck } from "@/components/instruction-check";
import { ReviewStart } from "@/components/review-start";

/**
 * Where reviewing starts (specification 5.4 and form R).
 *
 * First the policy and four questions about how to apply it. After that,
 * one item at a time, chosen for the reviewer: there is no list to browse
 * and no way to swap an item for another except by saying why.
 */
export default async function ReviewHome() {
  const { user } = await requireOnboarded();
  const summary = await reviewerSummary(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 font-serif text-3xl font-medium tracking-tight">
          <ClipboardCheck className="h-5 w-5" />
          Review
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You are given one record at a time: a conversation someone else
          submitted, or several linked sessions, without their name or
          anything they wrote about it. You judge exactly what is shown,
          under the reference policy below.
        </p>
      </div>

      {summary.policyReady ? (
        <>
          <ReviewStart
            activeAssignmentId={summary.active?.id ?? null}
            activePurpose={summary.active?.purpose ?? null}
            reviewed={summary.reviewed}
            compared={summary.compared}
            skipped={summary.skipped}
          />
          <details className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              Reference policy (version {summary.policy.version})
            </summary>
            <div className="markdown mt-3 text-sm leading-relaxed">
              <ReactMarkdown>{summary.policy.body}</ReactMarkdown>
            </div>
          </details>
        </>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-serif text-xl font-medium">
              Reference policy
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
