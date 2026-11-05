import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/gate";
import { getReview, getTranscriptForReview } from "@/lib/reviews";
import { ReviewWorkspace } from "@/components/review-workspace";

export default async function ReviewTranscriptPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { user } = await requireOnboarded();

  const transcript = await getTranscriptForReview(conversationId, user.id);
  if (!transcript) notFound();
  const existing = await getReview(conversationId, user.id);

  return (
    <ReviewWorkspace
      transcript={transcript}
      existing={{
        intent: existing?.intent ?? null,
        misusePresent: existing?.misusePresent ?? null,
        actor: existing?.actor ?? null,
        goalText: existing?.goalText ?? null,
        confidence: existing?.confidence ?? null,
        notes: existing?.notes ?? null,
      }}
      alreadyReviewed={existing != null}
      submissionCount={existing?.submissionCount ?? 0}
    />
  );
}
