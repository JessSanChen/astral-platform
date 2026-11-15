"use server";

import { z } from "zod";
import {
  EpisodeError,
  createRelatedVersion,
  reviseRelatedIntent,
  saveAuthorLabels,
  saveEpisodeDetails,
  saveSessionLabels,
  submitEpisode,
  submitSession,
} from "@/lib/episodes";
import {
  COMPARISON_INTENT_VALUES,
  LIMITS,
  PROVENANCE_VALUES,
} from "@/lib/episode-options";
import { authorLabelsInput, sessionLabelsInput } from "@/lib/author-labels";
import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { getEventSettings } from "@/lib/openrouter";

/**
 * Everything a participant does to their own work other than chat in it.
 *
 * Each action answers with `{ ok }` and, when it could not be done, the
 * reason in words meant for the person. None of them throw at the page.
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function run<T extends object>(work: (userId: string) => Promise<T>): Promise<Result<T>> {
  const cu = await getCurrentUser();
  if (!cu) return { ok: false, message: "Please sign in again." };
  const blocked = whyBlocked(cu);
  if (blocked) return { ok: false, message: blocked.message };
  try {
    return { ok: true, ...(await work(cu.user.id)) };
  } catch (error) {
    if (error instanceof EpisodeError) return { ok: false, message: error.message };
    throw error;
  }
}

/** One session's answers, for a session in a folder. */
export async function saveSessionLabelsAction(conversationId: string, labels: unknown) {
  const parsed = sessionLabelsInput.safeParse(labels);
  if (!parsed.success) {
    return { ok: false as const, message: "Those answers could not be saved. Try again." };
  }
  return run(async (userId) => {
    await saveSessionLabels(conversationId, userId, parsed.data);
    return {};
  });
}

/** Changes what a draft related conversation says it set out to explore. */
export async function reviseRelatedAction(
  targetConversationId: string,
  input: { intent: string; intendedDifference: string },
) {
  const parsed = relatedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  return run((userId) => reviseRelatedIntent({ targetConversationId, userId, ...parsed.data }));
}

/** The author's answers about their work, saved as they are given. */
export async function saveLabelsAction(episodeId: string, labels: unknown) {
  const parsed = authorLabelsInput.safeParse(labels);
  if (!parsed.success) {
    return { ok: false as const, message: "Those answers could not be saved. Try again." };
  }
  return run(async (userId) => {
    await saveAuthorLabels(episodeId, userId, parsed.data);
    return {};
  });
}

const detailsSchema = z.object({
  title: z.string().trim().max(LIMITS.title).optional(),
  provenance: z.enum(PROVENANCE_VALUES).optional(),
  goal: z.string().trim().max(LIMITS.goal).nullable().optional(),
});

export async function saveDetailsAction(
  episodeId: string,
  patch: { title?: string; provenance?: string; goal?: string | null },
) {
  const parsed = detailsSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false as const, message: "That is too long to save. Shorten it and try again." };
  }
  return run(async (userId) => {
    const { savedAt } = await saveEpisodeDetails(episodeId, userId, parsed.data);
    return { savedAt: savedAt.toISOString() };
  });
}

export async function submitEpisodeAction(episodeId: string) {
  return run(async (userId) => {
    const result = await submitEpisode(episodeId, userId);
    return { submittedAt: (result.episode.submittedAt ?? new Date()).toISOString() };
  });
}

/**
 * Submits one conversation by itself. In a folder that leaves the folder
 * open; a conversation that stands alone is the whole of its work.
 */
export async function submitSessionAction(conversationId: string) {
  return run(async (userId) => {
    const result = await submitSession(conversationId, userId);
    return {
      submittedAt: new Date().toISOString(),
      episodeSubmitted: result.episode.status === "submitted",
    };
  });
}

const relatedSchema = z.object({
  intent: z.enum(COMPARISON_INTENT_VALUES, { message: "Choose what you would like to explore." }),
  // Optional: the choice above is the answer, and this adds to it.
  intendedDifference: z.string().trim().max(LIMITS.intendedDifference).optional().default(""),
});

export async function createRelatedAction(
  sourceConversationId: string,
  input: { intent: string; intendedDifference: string },
) {
  const parsed = relatedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const settings = await getEventSettings();
  if (!settings.comparisonActivityOpen) {
    return { ok: false as const, message: "Related conversations are not open yet." };
  }
  return run(async (userId) => {
    const { episode, session } = await createRelatedVersion({
      sourceConversationId,
      userId,
      ...parsed.data,
    });
    return {
      id: session.id,
      episodeId: episode.id,
      isFolder: episode.isFolder,
      episodeTitle: episode.title,
    };
  });
}
