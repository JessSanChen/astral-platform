import type { UIMessage } from "ai";
import { getCurrentUser } from "@/lib/gate";
import {
  getOwnedConversation,
  getVisibleMessages,
  messageMeta,
} from "@/lib/conversations";
import { ChatError } from "@/lib/openrouter";

/**
 * The conversation's messages as the server currently has them.
 *
 * The chat page is prefetched and cached in the browser so navigation feels
 * instant, which means what it shows can be slightly behind, most obviously
 * when a reply finished generating after the participant had switched away.
 * The chat view calls this once on open and quietly fills in anything
 * missing.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Unauthorized" }, { status: 401 });

  try {
    await getOwnedConversation(conversationId, cu.user.id);
  } catch (e) {
    if (e instanceof ChatError)
      return Response.json({ message: e.message }, { status: 404 });
    throw e;
  }

  const rows = await getVisibleMessages(conversationId);
  const messages: UIMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role,
    metadata: messageMeta(m),
    parts: (m.parts as UIMessage["parts"]) ?? [{ type: "text", text: m.content }],
  }));
  return Response.json({ messages });
}
