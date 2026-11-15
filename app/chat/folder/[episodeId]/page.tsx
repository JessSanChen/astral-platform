import { notFound, redirect } from "next/navigation";
import { FolderDetails } from "@/components/folder-details";
import { readFolderLabels, readSessionLabels, sessionLabelsComplete } from "@/lib/author-labels";
import { EpisodeError, getOwnedEpisode, listSessions } from "@/lib/episodes";
import { requireOnboarded } from "@/lib/gate";
import { getEventSettings } from "@/lib/openrouter";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A folder's own page: the answers that hold across its sessions, and the
 * sessions themselves. Reached from the folder's name in the list.
 */
export default async function FolderPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  if (!UUID.test(episodeId)) notFound();
  const { user } = await requireOnboarded();

  let ep;
  try {
    ep = await getOwnedEpisode(episodeId, user.id);
  } catch (e) {
    if (e instanceof EpisodeError) notFound();
    throw e;
  }
  const [sessions, settings] = await Promise.all([listSessions(ep.id), getEventSettings()]);
  // A conversation that stands alone has no page of this kind.
  if (!ep.isFolder) redirect(sessions[0] ? `/chat/${sessions[0].id}` : "/chat");

  const modelName = (id: string) =>
    settings.enabledModels.find((m) => m.id === id)?.displayName ?? id;

  return (
    <FolderDetails
      // Rebuilt when the folder changes, so its boxes start from what is stored.
      key={ep.id}
      episodeId={ep.id}
      title={ep.title}
      submitted={ep.status === "submitted"}
      labels={readFolderLabels(ep.authorLabels)}
      goal={ep.goalText ?? ""}
      sessions={sessions.map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title === "New conversation" ? `Session ${s.order}` : s.title,
        model: modelName(s.modelId),
        started: s.userMessages > 0,
        answered: sessionLabelsComplete(readSessionLabels(s.authorLabels)),
      }))}
    />
  );
}
