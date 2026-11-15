import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PairAuditLoader, ReviewLoader } from "@/components/review-loader";
import { Button } from "@/components/ui/button";
import { loadAssignment, reviewerSummary, touchAssignment } from "@/lib/assignments";
import { comparisonIntentHelp, comparisonIntentLabel } from "@/lib/episode-options";
import { requireOnboarded } from "@/lib/gate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A skipped or timed-out item has nothing in it to come back to.
const ENDED: Record<string, { heading: string; detail: string }> = {
  skipped: { heading: "You skipped this one", detail: "Your reason was recorded." },
  expired: {
    heading: "Your hold on this one ran out",
    detail:
      "It was left untouched for a while, so it was made available again. Nothing was recorded. It may be given to you again.",
  },
};

/**
 * One assigned item. Only the person it was given to can open it; anyone
 * else, and any address that is not an assignment, gets the same Not found.
 */
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  if (!UUID.test(assignmentId)) notFound();
  const { user } = await requireOnboarded();
  const loaded = await loadAssignment(assignmentId, user.id);
  if (!loaded) notFound();

  if (loaded.assignment.state !== "active" && loaded.assignment.state !== "completed") {
    const ended = ENDED[loaded.assignment.state] ?? ENDED.skipped;
    return (
      <div className="mx-auto max-w-xl space-y-4 px-6 py-16">
        <h1 className="font-serif text-2xl font-medium">{ended.heading}</h1>
        <p className="text-sm text-muted-foreground">{ended.detail}</p>
        <Link href="/review">
          <Button>Back to Review</Button>
        </Link>
      </div>
    );
  }

  // New review instructions have to be read, and the questions about them
  // answered, before
  // anything is judged under it. The item stays theirs meanwhile.
  const summary = await reviewerSummary(user.id);
  if (!summary.policyReady) redirect("/review");
  if (loaded.assignment.state === "active") await touchAssignment(assignmentId, user.id);
  const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

  if (loaded.kind === "pair_audit") {
    return (
      <PairAuditLoader
        // One screen per record: nothing typed for one carries into the next.
        key={assignmentId}
        assignmentId={assignmentId}
        intendedDifference={loaded.pair.intendedDifference}
        intentLabel={comparisonIntentLabel(loaded.pair.comparisonIntent)}
        intentHelp={comparisonIntentHelp(loaded.pair.comparisonIntent)}
        source={loaded.pair.source}
        target={loaded.pair.target}
        anchorConversationId={loaded.anchorConversationId}
        // A finished comparison opens again with its answers, to be changed.
        submitted={
          loaded.answered
            ? {
                at: iso(loaded.answered.submittedAt)!,
                revisedAt: iso(loaded.answered.revisedAt),
                answers: {
                  topicTaskMatch: loaded.answered.topicTaskMatch,
                  scopeSimilarity: loaded.answered.scopeSimilarity ?? "",
                  mainDifference: loaded.answered.mainDifference ?? "",
                  auditNote: loaded.answered.auditNote ?? "",
                },
              }
            : null
        }
      />
    );
  }

  return (
    <ReviewLoader
      key={assignmentId}
      assignmentId={assignmentId}
      content={loaded.view.content}
      policy={{ version: summary.policy.version, body: summary.policy.body }}
      anchorConversationId={loaded.anchorConversationId}
      // A finished review opens again with its answers, to be changed.
      submitted={
        loaded.answered
          ? {
              at: iso(loaded.answered.submittedAt)!,
              revisedAt: iso(loaded.answered.revisedAt),
              answers: {
                verdict: loaded.answered.verdict,
                confidence: loaded.answered.confidence,
                evidenceMode: loaded.answered.evidenceMode,
                evidenceTurns: loaded.answered.evidenceTurns,
                rationale: loaded.answered.rationale,
                subjectSensitivity: loaded.answered.subjectSensitivity,
                aimEvidence: loaded.answered.aimEvidence,
              },
            }
          : null
      }
    />
  );
}
