import { notFound, redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/gate";
import { EpisodeError, getOwnedEpisode, listSessions } from "@/lib/episodes";
import { getEventSettings } from "@/lib/openrouter";
import { RelatedVersionForm } from "@/components/related-version-form";

/**
 * The short form for a related version (specification B3): what will
 * change, described before the new conversation starts.
 */
export default async function RelatedVersionPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  const { user } = await requireOnboarded();

  let source;
  try {
    source = await getOwnedEpisode(episodeId, user.id);
  } catch (e) {
    if (e instanceof EpisodeError) notFound();
    throw e;
  }
  const [sessions, settings] = await Promise.all([listSessions(source.id), getEventSettings()]);
  const first = sessions[0];
  // A related version is made from a submission. A draft is submitted from
  // its own page first, where what that means is spelled out.
  if (source.status !== "submitted" || !settings.comparisonActivityOpen) {
    redirect(first ? `/chat/${first.id}` : "/chat");
  }

  return (
    <RelatedVersionForm
      sourceEpisodeId={source.id}
      sourceTitle={source.isFolder ? source.title : (first?.title ?? source.title)}
      sourceSessionId={first?.id ?? null}
      sourceProvenance={source.taskProvenance ?? ""}
    />
  );
}
