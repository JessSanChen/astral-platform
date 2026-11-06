"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { requireOnboarded } from "@/lib/gate";

/**
 * Renames a conversation.
 *
 * Names default to the first message, which is a reasonable guess and often
 * a poor label once a conversation has gone somewhere. A participant running
 * several threads needs to tell them apart, and the organizers reading
 * transcripts later benefit from a name someone chose on purpose.
 */
export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<{ title?: string; message?: string }> {
  const { user } = await requireOnboarded();
  const trimmed = title.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!trimmed) return { message: "A name cannot be empty." };

  const [updated] = await db
    .update(conversation)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(
      and(eq(conversation.id, conversationId), eq(conversation.userId, user.id)),
    )
    .returning({ title: conversation.title });

  if (!updated) return { message: "Conversation not found." };
  return { title: updated.title };
}
