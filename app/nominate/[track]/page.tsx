import { notFound, redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/gate";
import {
  getNomination,
  nominationStatus,
  trackFromAddress,
} from "@/lib/nominations";
import { NominationForm } from "@/components/nomination-form";

export default async function NominateTrackPage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  const { track } = await params;
  const definition = trackFromAddress(track);
  if (!definition) notFound();
  // An address from before an award was renamed goes to the one it has now.
  if (track !== definition.slug) redirect(`/nominate/${definition.slug}`);

  const { user } = await requireOnboarded();
  const [existing, status] = await Promise.all([
    getNomination(user.id, definition.value),
    nominationStatus(),
  ]);

  return (
    <NominationForm
      track={definition.value}
      label={definition.label}
      blurb={`${definition.question} ${definition.focus}`}
      locked={status.locked}
      closeAt={status.closeAt?.toISOString() ?? null}
      existing={
        existing
          ? {
              headline: existing.headline,
              details: existing.details,
              slidesUrl: existing.slidesUrl,
              updatedAt: existing.updatedAt.toISOString(),
              submissionCount: existing.submissionCount,
            }
          : null
      }
    />
  );
}
