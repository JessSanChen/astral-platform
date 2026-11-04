"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  profile,
  submission,
  transcriptLabels,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/gate";
import { getOwnedConversation, getVisibleMessages } from "@/lib/conversations";
import { draftLabelsSchema, submitLabelsSchema } from "@/lib/labels-schema";

export type LabelsState = {
  errors?: Record<string, string>;
  message?: string;
  savedAt?: number;
  submittedVersion?: number;
};

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
  const cu = await getCurrentUser();
  if (!cu) return { message: "Please sign in again." };
  const conversationId = String(formData.get("conversationId"));

  try {
    await getOwnedConversation(conversationId, cu.user.id);
  } catch {
    return { message: "Conversation not found." };
  }

  const parsed = draftLabelsSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { message: "Some answers could not be saved." };
  }

  await writeLabels(conversationId, parsed.data);
  revalidatePath(`/chat/${conversationId}`);
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
  const cu = await getCurrentUser();
  if (!cu) return { message: "Please sign in again." };
  const conversationId = String(formData.get("conversationId"));

  let convo;
  try {
    convo = await getOwnedConversation(conversationId, cu.user.id);
  } catch {
    return { message: "Conversation not found." };
  }

  const messages = await getVisibleMessages(conversationId);
  if (messages.length === 0) {
    return { message: "Have a conversation before submitting it." };
  }

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

  const version = convo.currentVersion + 1;
  const now = new Date();

  await db.transaction(async (tx) => {
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
        firstSubmittedAt: convo.firstSubmittedAt ?? now,
        lastSubmittedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(conversation.id, conversationId), eq(conversation.userId, cu.user.id)),
      );
  });

  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");
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
