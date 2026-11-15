import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/gate";
import { EpisodeError, getOwnedEpisode, listSessions } from "@/lib/episodes";
import { getEventSettings } from "@/lib/openrouter";
import { NewConversation } from "@/components/new-conversation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where new work starts: a conversation, a folder, or, with `?to=` naming
 * a draft, another session in it.
 */
export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; to?: string }>;
}) {
  const { user } = await requireOnboarded();
  const [settings, { folder, to }] = await Promise.all([getEventSettings(), searchParams]);

  let target = null;
  if (to && UUID.test(to)) {
    try {
      const ep = await getOwnedEpisode(to, user.id);
      const sessions = await listSessions(ep.id);
      // Nothing can be added to submitted work.
      if (ep.status !== "draft") redirect(sessions[0] ? `/chat/${sessions[0].id}` : "/chat");
      target = {
        episodeId: ep.id,
        title: ep.title,
        isFolder: ep.isFolder,
        sessions: sessions.length,
      };
    } catch (e) {
      if (!(e instanceof EpisodeError)) throw e;
    }
  }

  return (
    <NewConversation
      // A different form for each, so moving between them starts clean.
      key={target ? target.episodeId : folder ? "folder" : "new"}
      models={settings.enabledModels}
      target={target}
      startAsFolder={Boolean(folder)}
    />
  );
}
