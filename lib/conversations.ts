import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, message, transcriptLabels } from "@/db/schema";
import { ChatError } from "@/lib/openrouter";

export type DbMessage = typeof message.$inferSelect;

/** All of a user's conversations for the sidebar. */
export async function listConversations(userId: string) {
  return db
    .select({
      id: conversation.id,
      title: conversation.title,
      modelId: conversation.modelId,
      status: conversation.status,
      currentVersion: conversation.currentVersion,
      lastSubmittedAt: conversation.lastSubmittedAt,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt,
    })
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(sql`coalesce(${conversation.lastMessageAt}, ${conversation.createdAt})`));
}

/**
 * Loads a conversation, enforcing ownership. Every read of a conversation
 * goes through here so a participant can never open someone else's id.
 */
export async function getOwnedConversation(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)));
  if (!row) throw new ChatError("not_found", "Conversation not found.");
  return row;
}

/** Visible messages, oldest first. Superseded (regenerated) replies excluded. */
export async function getVisibleMessages(conversationId: string) {
  return db
    .select()
    .from(message)
    .where(
      and(
        eq(message.conversationId, conversationId),
        isNull(message.supersededBy),
      ),
    )
    .orderBy(asc(message.seq));
}

/**
 * Appends a message, assigning its sequence number atomically.
 *
 * Reading max(seq) and then inserting is a race: two simultaneous requests in
 * the same conversation read the same number and the second insert violates
 * the (conversation_id, seq) unique index. Locking the conversation row first
 * serializes appends within one conversation while leaving different
 * conversations fully parallel, which is where the real concurrency is.
 */
export async function appendMessage(
  values: Omit<typeof message.$inferInsert, "seq">,
): Promise<DbMessage> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select 1 from ${conversation} where ${conversation.id} = ${values.conversationId} for update`,
    );
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${message.seq}), 0)::int` })
      .from(message)
      .where(eq(message.conversationId, values.conversationId));
    const [row] = await tx
      .insert(message)
      .values({ ...values, seq: (max ?? 0) + 1 })
      .returning();
    return row;
  });
}

export async function createConversation(opts: {
  userId: string;
  modelId: string;
  scenario?: string | null;
}) {
  const [row] = await db
    .insert(conversation)
    .values({
      userId: opts.userId,
      modelId: opts.modelId,
      scenario: opts.scenario?.trim() || null,
    })
    .returning();
  // Every conversation gets an (empty) labels row so the form has somewhere
  // to write without a special case for the first save.
  await db
    .insert(transcriptLabels)
    .values({ conversationId: row.id })
    .onConflictDoNothing();
  return row;
}

/** Derives a short title from the first user message. */
export function deriveTitle(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length <= 60 ? clean : clean.slice(0, 57) + "...";
}

export async function touchConversation(id: string, patch: Partial<typeof conversation.$inferInsert> = {}) {
  await db
    .update(conversation)
    .set({ updatedAt: new Date(), lastMessageAt: new Date(), ...patch })
    .where(eq(conversation.id, id));
}

/**
 * How a stored message became what it is, carried alongside the text.
 *
 * A reply that arrives empty is not nothing: it is usually a refusal, either
 * by the model or by the provider's own filter, and for this study that is a
 * result worth seeing and labelling rather than a blank to be hidden.
 */
export type MessageMeta = {
  finishReason?: string | null;
  blocked?: boolean;
};

export function messageMeta(row: {
  finishReason: string | null;
  error: unknown;
}): MessageMeta {
  return {
    finishReason: row.finishReason,
    blocked: row.error != null,
  };
}
