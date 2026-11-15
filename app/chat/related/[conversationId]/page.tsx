import { notFound, redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/gate";
import { getOwnedConversation } from "@/lib/conversations";
import { ChatError, getEventSettings } from "@/lib/openrouter";
import { RelatedVersionForm } from "@/components/related-version-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The short form for a related version (specification B3): what the new
 * conversation sets out to explore, said before it starts.
 *
 * A related version is made from one conversation: one that stands alone,
 * or one session of a folder. It is that conversation the new one is
 * linked to, not the folder.
 */
export default async function RelatedVersionPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  if (!UUID.test(conversationId)) notFound();
  const { user } = await requireOnboarded();

  let source;
  try {
    source = await getOwnedConversation(conversationId, user.id);
  } catch (e) {
    if (e instanceof ChatError) notFound();
    throw e;
  }
  const settings = await getEventSettings();
  // A related version is made from a submission. A draft is submitted from
  // its own page first, where what that means is spelled out.
  if (source.status !== "submitted" || !settings.comparisonActivityOpen) {
    redirect(`/chat/${source.id}`);
  }

  return (
    <RelatedVersionForm sourceConversationId={source.id} sourceTitle={source.title} />
  );
}
