import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PairAuditLoader, ReviewLoader } from "@/components/review-loader";
import { Button } from "@/components/ui/button";
import { loadAssignment, reviewerSummary, touchAssignment } from "@/lib/assignments";
import { comparisonIntentLabel } from "@/lib/episode-options";
import { requireOnboarded } from "@/lib/gate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENDED: Record<string, { heading: string; detail: string }> = {
  completed: {
    heading: "You have finished this one",
    detail: "Your answer was recorded and is final.",
  },
  skipped: { heading: "You skipped this one", detail: "Your reason was recorded." },
  expired: {
    heading: "Your hold on this one ran out",
    detail:
      "It was left untouched for a while, so it was made available to others. Nothing was recorded.",
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

  if (loaded.assignment.state !== "active") {
    const ended = ENDED[loaded.assignment.state] ?? ENDED.completed;
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
  await touchAssignment(assignmentId, user.id);

  if (loaded.kind === "pair_audit") {
    return (
      <PairAuditLoader
        assignmentId={assignmentId}
        intendedDifference={loaded.pair.intendedDifference}
        intentLabel={comparisonIntentLabel(loaded.pair.comparisonIntent)}
        source={loaded.pair.source}
        target={loaded.pair.target}
        anchorConversationId={loaded.anchorConversationId}
      />
    );
  }

  return (
    <ReviewLoader
      assignmentId={assignmentId}
      content={loaded.view.content}
      policy={{ version: summary.policy.version, body: summary.policy.body }}
      anchorConversationId={loaded.anchorConversationId}
    />
  );
}
