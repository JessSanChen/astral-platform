import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transcriptLabels } from "@/db/schema";
import { requireOnboarded } from "@/lib/gate";
import { getEventSettings, ChatError } from "@/lib/openrouter";
import { getOwnedConversation, getVisibleMessages } from "@/lib/conversations";
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

  const rows = await getVisibleMessages(conversationId);
  const settings = await getEventSettings();
  const [labels] = await db
    .select()
    .from(transcriptLabels)
    .where(eq(transcriptLabels.conversationId, conversationId));

  const initialMessages: UIMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role,
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

  const lastSubmitted = convo.lastSubmittedAt?.getTime() ?? 0;
  const changedSinceSubmit =
    convo.status === "submitted" &&
    Math.max(
      convo.updatedAt?.getTime() ?? 0,
      labels?.updatedAt?.getTime() ?? 0,
    ) > lastSubmitted;

  return (
    <ConversationWorkspace
      conversationId={convo.id}
      modelId={convo.modelId}
      scenario={convo.scenario}
      models={models}
      initialMessages={initialMessages}
      locked={rows.length > 0}
      status={convo.status}
      currentVersion={convo.currentVersion}
      changedSinceSubmit={changedSinceSubmit}
      hasMessages={rows.length > 0}
      labels={{
        type: labels?.type ?? null,
        rolePreset: labels?.rolePreset ?? null,
        roleText: labels?.roleText ?? null,
        goalText: labels?.goalText ?? null,
        modelBehaviour: labels?.modelBehaviour ?? null,
        domainTags: labels?.domainTags ?? [],
        keyTurnMessageId: labels?.keyTurnMessageId ?? null,
        challengeFlag: labels?.challengeFlag ?? null,
        notes: labels?.notes ?? null,
      }}
      turns={rows.map((m) => ({
        id: m.id,
        seq: m.seq,
        role: m.role,
        preview:
          m.content.replace(/\s+/g, " ").slice(0, 50) +
          (m.content.length > 50 ? "..." : ""),
      }))}
    />
  );
}
