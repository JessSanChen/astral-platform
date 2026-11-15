import { readLabels } from "@/lib/author-labels";
import { outer } from "@/lib/sql";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { episode as episodeTable } from "@/db/schema";
import { requireOnboarded } from "@/lib/gate";
import { getEventSettings, ChatError } from "@/lib/openrouter";
import {
  getOwnedConversation,
  getVisibleMessages,
  messageMeta,
} from "@/lib/conversations";
import { listSessions, relatedLinks } from "@/lib/episodes";
import { ConversationWorkspace } from "@/components/conversation-workspace";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { user } = await requireOnboarded();

  let convo;
  try {
    convo = await getOwnedConversation(conversationId, user.id);
  } catch (e) {
    if (e instanceof ChatError) notFound();
    throw e;
  }
  if (!convo.episodeId) notFound();

  // Fetched together. These do not depend on each other, and running them in
  // sequence costs one network round trip each on every navigation.
  const [rows, settings, [ep], sessions, links] = await Promise.all([
    getVisibleMessages(conversationId),
    getEventSettings(),
    db.select().from(episodeTable).where(eq(episodeTable.id, convo.episodeId)),
    listSessions(convo.episodeId),
    relatedLinks(convo.episodeId),
  ]);
  if (!ep) notFound();

  const initialMessages: UIMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role,
    metadata: messageMeta(m),
    parts: (m.parts as UIMessage["parts"]) ?? [{ type: "text", text: m.content }],
  }));

  // Keep showing a model by name even if the admin disabled it mid-event.
  const models = settings.enabledModels.some((m) => m.id === convo.modelId)
    ? settings.enabledModels
    : [
        ...settings.enabledModels,
        {
          id: convo.modelId,
          displayName: convo.modelId,
          family: "open" as const,
          sort: 999,
          enabled: false,
        },
      ];

  // The titles of the episodes this one is linked to, for the panel.
  const linkedIds = links.map((l) =>
    l.sourceEpisodeId === ep.id ? l.targetEpisodeId : l.sourceEpisodeId,
  );
  const linked = linkedIds.length
    ? await db
        .select({
          id: episodeTable.id,
          title: episodeTable.title,
          status: episodeTable.status,
          firstSessionId: sql<string | null>`(
            select c.id from conversation c
            where c.episode_id = ${outer(episodeTable.id)} order by c.session_order limit 1
          )`,
          firstSessionTitle: sql<string | null>`(
            select c.title from conversation c
            where c.episode_id = ${outer(episodeTable.id)} order by c.session_order limit 1
          )`,
          isFolder: episodeTable.isFolder,
        })
        .from(episodeTable)
        .where(
          and(
            eq(episodeTable.userId, user.id),
            sql`${episodeTable.id} in (${sql.join(
              linkedIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
    : [];
  const nameOf = (id: string) => {
    const e = linked.find((x) => x.id === id);
    if (!e) return null;
    return {
      title: e.isFolder ? e.title : (e.firstSessionTitle ?? e.title),
      sessionId: e.firstSessionId,
      submitted: e.status === "submitted",
    };
  };


  return (
    <ConversationWorkspace
      conversationId={convo.id}
      title={convo.title}
      modelId={convo.modelId}
      scenario={convo.scenario}
      models={models}
      initialMessages={initialMessages}
      hasMessages={rows.length > 0}
      episode={{
        id: ep.id,
        title: ep.title,
        isFolder: ep.isFolder,
        status: ep.status,
        submittedAt: ep.submittedAt?.toISOString() ?? null,
        provenance: ep.taskProvenance,
        goal: ep.goalText ?? "",
        labels: readLabels(ep.authorLabels),
        related: ep.creationMethod === "related_live",
        comparisonOpen: settings.comparisonActivityOpen,
        sessions: sessions.map((s) => ({
          id: s.id,
          order: s.order,
          title: s.title,
          userMessages: s.userMessages,
        })),
        madeFrom: links
          .filter((l) => l.targetEpisodeId === ep.id)
          .map((l) => ({
            intent: l.comparisonIntent,
            difference: l.intendedDifference,
            other: nameOf(l.sourceEpisodeId),
          }))[0] ?? null,
        versions: links
          .filter((l) => l.sourceEpisodeId === ep.id)
          .map((l) => ({
            intent: l.comparisonIntent,
            difference: l.intendedDifference,
            other: nameOf(l.targetEpisodeId),
          })),
      }}
    />
  );
}
