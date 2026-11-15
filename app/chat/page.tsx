import { requireOnboarded } from "@/lib/gate";
import { getEventSettings } from "@/lib/openrouter";
import { NewConversation } from "@/components/new-conversation";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  await requireOnboarded();
  const [settings, { folder }] = await Promise.all([getEventSettings(), searchParams]);
  return (
    <NewConversation
      // A different form for each, so switching between them starts clean.
      key={folder ? "folder" : "conversation"}
      models={settings.enabledModels}
      folder={Boolean(folder)}
    />
  );
}
