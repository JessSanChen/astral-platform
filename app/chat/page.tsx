import { requireOnboarded } from "@/lib/gate";
import { getEventSettings } from "@/lib/openrouter";
import { NewConversation } from "@/components/new-conversation";

export default async function NewChatPage() {
  await requireOnboarded();
  const settings = await getEventSettings();
  return <NewConversation models={settings.enabledModels} />;
}
