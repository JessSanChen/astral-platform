import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/gate";
import {
  NOMINATION_TRACKS,
  getNomination,
  nominationStatus,
  type TrackValue,
} from "@/lib/nominations";
import { NominationForm } from "@/components/nomination-form";

export default async function NominateTrackPage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  const { track } = await params;
  const definition = NOMINATION_TRACKS.find((t) => t.value === track);
  if (!definition) notFound();

  const { user } = await requireOnboarded();
  const [existing, status] = await Promise.all([
    getNomination(user.id, track as TrackValue),
    nominationStatus(),
  ]);

  return (
    <NominationForm
      track={definition.value}
      label={definition.label}
      blurb={definition.blurb}
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
