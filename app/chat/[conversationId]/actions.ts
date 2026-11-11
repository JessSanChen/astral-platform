"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  message,
  profile,
  submission,
  transcriptLabels,
} from "@/db/schema";
import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { getOwnedConversation } from "@/lib/conversations";
import { draftLabelsSchema, submitLabelsSchema } from "@/lib/labels-schema";

export type LabelsState = {
  errors?: Record<string, string>;
  message?: string;
  savedAt?: number;
  submittedVersion?: number;
};

/**
 * Who may change labels or submit. The same conditions the pages apply, since
 * an action can be called without ever loading the page: a paused account
 * could otherwise keep submitting transcripts towards a prize.
 */
async function activeUser() {
  const cu = await getCurrentUser();
  if (!cu) return { error: "Please sign in again." } as const;
  const blocked = whyBlocked(cu);
  if (blocked) return { error: blocked.message } as const;
  return { cu } as const;
}

function readForm(formData: FormData) {
  const str = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  return {
    type: str("type"),
    rolePreset: str("rolePreset"),
    roleText: str("roleText"),
    goalText: str("goalText"),
    modelBehaviour: str("modelBehaviour"),
    domainTags: formData.getAll("domainTags").map(String),
    keyTurnMessageId: str("keyTurnMessageId"),
    challengeFlag: str("challengeFlag"),
    notes: str("notes"),
  };
}

/** Saves work in progress. Nothing is required yet. */
export async function saveLabels(
  _prev: LabelsState,
  formData: FormData,
): Promise<LabelsState> {
  const who = await activeUser();
  if ("error" in who) return { message: who.error };
  const { cu } = who;
  const conversationId = String(formData.get("conversationId"));

  let convo;
  try {
    convo = await getOwnedConversation(conversationId, cu.user.id);
  } catch {
    return { message: "Conversation not found." };
  }
  if (convo.lockedAt) {
    return {
      message:
        "This transcript has been independently reviewed, so its labels are now fixed.",
    };
  }

  const parsed = draftLabelsSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { message: "Some answers could not be saved." };
  }

  await writeLabels(conversationId, parsed.data);
  return { savedAt: Date.now() };
}

/**
 * Submits the transcript. Each submit writes an immutable snapshot as the
 * next version, so a later edit never rewrites what was already submitted.
 */
export async function submitTranscript(
  _prev: LabelsState,
  formData: FormData,
): Promise<LabelsState> {
  const who = await activeUser();
  if ("error" in who) return { message: who.error };
  const { cu } = who;
  const conversationId = String(formData.get("conversationId"));

  let convo;
  try {
    convo = await getOwnedConversation(conversationId, cu.user.id);
  } catch {
    return { message: "Conversation not found." };
  }

  const LOCKED =
    "This transcript has been independently reviewed, so its labels are now fixed.";
  if (convo.lockedAt) return { message: LOCKED };

  const parsed = submitLabelsSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    // Save what they did fill in, so nothing is lost on a failed submit.
    await writeLabels(conversationId, draftLabelsSchema.parse(readForm(formData)));
    return { errors, message: "Please complete the highlighted fields." };
  }

  const labels = parsed.data;
  const [participantProfile] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, cu.user.id));

  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    // Take the conversation's row for the length of this transaction, and
    // decide everything from what is read under that lock.
    //
    // The checks above were made before it, so on their own they leave a gap:
    // a review landing in between would lock the transcript and this would
    // still write a new version after it, and two submits at once would both
    // compute the same version number. A reviewer's submit and a new message
    // being saved take this same lock, so all three happen one at a time.
    const [fresh] = await tx
      .select({
        lockedAt: conversation.lockedAt,
        currentVersion: conversation.currentVersion,
        firstSubmittedAt: conversation.firstSubmittedAt,
      })
      .from(conversation)
      .where(
        and(eq(conversation.id, conversationId), eq(conversation.userId, cu.user.id)),
      )
      .for("update");
    if (!fresh) return { kind: "gone" as const };
    if (fresh.lockedAt) return { kind: "locked" as const };

    const messages = await tx
      .select()
      .from(message)
      .where(
        and(eq(message.conversationId, conversationId), isNull(message.supersededBy)),
      )
      .orderBy(asc(message.seq));
    if (messages.length === 0) return { kind: "empty" as const };

    const version = fresh.currentVersion + 1;

    await tx
      .insert(transcriptLabels)
      .values({ conversationId, ...labelValues(labels), updatedAt: now })
      .onConflictDoUpdate({
        target: transcriptLabels.conversationId,
        set: { ...labelValues(labels), updatedAt: now },
      });

    await tx.insert(submission).values({
      conversationId,
      version,
      submittedAt: now,
      // A self-contained record of exactly what was submitted, so later
      // edits to the conversation or the profile cannot change history.
      snapshot: {
        conversationId,
        version,
        modelId: convo.modelId,
        scenario: convo.scenario,
        title: convo.title,
        labels,
        participant: {
          userId: cu.user.id,
          name: cu.user.name,
          email: cu.user.email,
          profile: participantProfile ?? null,
        },
        messages: messages.map((m) => ({
          id: m.id,
          seq: m.seq,
          role: m.role,
          content: m.content,
          modelId: m.modelId,
          provider: m.provider,
          generationId: m.generationId,
          finishReason: m.finishReason,
          promptTokens: m.promptTokens,
          completionTokens: m.completionTokens,
          reasoningTokens: m.reasoningTokens,
          costUsd: m.costUsd,
          latencyMs: m.latencyMs,
          error: m.error,
          createdAt: m.createdAt,
        })),
        submittedAt: now,
      },
    });

    await tx
      .update(conversation)
      .set({
        status: "submitted",
        currentVersion: version,
        firstSubmittedAt: fresh.firstSubmittedAt ?? now,
        lastSubmittedAt: now,
        updatedAt: now,
      })
      .where(eq(conversation.id, conversationId));

    return { kind: "submitted" as const, version };
  });

  if (outcome.kind === "gone") return { message: "Conversation not found." };
  if (outcome.kind === "locked") return { message: LOCKED };
  if (outcome.kind === "empty")
    return { message: "Have a conversation before submitting it." };
  const version = outcome.version;

  // Deliberately no revalidatePath here. It would clear the browser's cached
  // copy of every conversation, so each later switch would go back to the
  // server and feel slow. The panel and sidebar already update themselves
  // from the result below.
  return { submittedVersion: version };
}

function labelValues(l: ReturnType<typeof draftLabelsSchema.parse>) {
  return {
    type: (l.type ?? null) as "benign" | "dual_use" | "adversarial" | null,
    rolePreset: l.rolePreset ?? null,
    roleText: l.roleText ?? null,
    goalText: l.goalText ?? null,
    modelBehaviour: (l.modelBehaviour ?? null) as
      | "fully_complied"
      | "partially_complied"
      | "refused"
      | "deflected"
      | null,
    domainTags: l.domainTags ?? [],
    keyTurnMessageId: l.keyTurnMessageId ?? null,
    challengeFlag: l.challengeFlag ?? null,
    notes: l.notes ?? null,
  };
}

async function writeLabels(
  conversationId: string,
  labels: ReturnType<typeof draftLabelsSchema.parse>,
) {
  const now = new Date();
  await db
    .insert(transcriptLabels)
    .values({ conversationId, ...labelValues(labels), updatedAt: now })
    .onConflictDoUpdate({
      target: transcriptLabels.conversationId,
      set: { ...labelValues(labels), updatedAt: now },
    });
}
