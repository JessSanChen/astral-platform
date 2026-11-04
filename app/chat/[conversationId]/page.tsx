import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { requireOnboarded } from "@/lib/gate";
import { getEventSettings, ChatError } from "@/lib/openrouter";
import { getOwnedConversation, getVisibleMessages } from "@/lib/conversations";
import { ChatView } from "@/components/chat-view";

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

  const initialMessages: UIMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role,
    parts: (m.parts as UIMessage["parts"]) ?? [{ type: "text", text: m.content }],
  }));

  // Models the admin disabled after this conversation started must still be
  // shown by name, so add the conversation's own model if it is missing.
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

  return (
    <ChatView
      conversationId={convo.id}
      modelId={convo.modelId}
      scenario={convo.scenario}
      models={models}
      initialMessages={initialMessages}
      locked={rows.length > 0}
    />
  );
}
