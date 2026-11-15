import { readLabels, readSessionLabels } from "@/lib/author-labels";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation as conversationTable, episode as episodeTable } from "@/db/schema";
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
    relatedLinks(convo.id),
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

  // The conversations this one is linked to as a related version, either
  // way round, for the panel. The link is between single conversations.
  const linkedIds = links
    .map((l) => (l.sourceConversationId === convo.id ? l.targetConversationId : l.sourceConversationId))
    .filter((id): id is string => Boolean(id));
  const linked = linkedIds.length
    ? await db
        .select({
          id: conversationTable.id,
          title: conversationTable.title,
          status: conversationTable.status,
        })
        .from(conversationTable)
        .where(
          and(
            eq(conversationTable.userId, user.id),
            sql`${conversationTable.id} in (${sql.join(
              linkedIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
    : [];
  const nameOf = (id: string | null) => {
    const c = linked.find((x) => x.id === id);
    if (!c) return null;
    return { title: c.title, sessionId: c.id, submitted: c.status === "submitted" };
  };

  const sessionLabels = readSessionLabels(convo.authorLabels);

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
        // This conversation by itself: in a folder it can be submitted,
        // and so closed, before the folder is.
        sessionStatus: convo.status === "submitted" ? "submitted" : "draft",
        sessionSubmittedAt: convo.lastSubmittedAt?.toISOString() ?? null,
        // A session in a folder answers for itself; a conversation that
        // stands alone answers for the work.
        goal: ep.isFolder ? sessionLabels.goal : (ep.goalText ?? ""),
        labels: ep.isFolder ? sessionLabels : readLabels(ep.authorLabels),
        comparisonOpen: settings.comparisonActivityOpen,
        sessions: sessions.map((s) => ({
          id: s.id,
          order: s.order,
          title: s.title,
          userMessages: s.userMessages,
          submitted: s.status === "submitted",
        })),
        madeFrom: links
          .filter((l) => l.targetConversationId === convo.id)
          .map((l) => ({
            intent: l.comparisonIntent,
            difference: l.intendedDifference,
            other: nameOf(l.sourceConversationId),
          }))[0] ?? null,
        versions: links
          .filter((l) => l.sourceConversationId === convo.id)
          .map((l) => ({
            intent: l.comparisonIntent,
            difference: l.intendedDifference,
            other: nameOf(l.targetConversationId),
          })),
      }}
    />
  );
}
