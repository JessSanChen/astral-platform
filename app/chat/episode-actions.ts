"use server";

import { z } from "zod";
import {
  EpisodeError,
  addSession,
  createRelatedVersion,
  saveAuthorLabels,
  saveEpisodeDetails,
  submitEpisode,
} from "@/lib/episodes";
import {
  COMPARISON_INTENT_VALUES,
  LIMITS,
  PROVENANCE_VALUES,
} from "@/lib/episode-options";
import { authorLabelsInput } from "@/lib/author-labels";
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

export async function addSessionAction(episodeId: string) {
  return run(async (userId) => {
    const session = await addSession(episodeId, userId);
    return { id: session.id, sessionOrder: session.sessionOrder };
  });
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

const relatedSchema = z.object({
  intent: z.enum(COMPARISON_INTENT_VALUES, { message: "Choose what you would like to change." }),
  intendedDifference: z
    .string()
    .trim()
    .min(1, "Briefly describe what you will change.")
    .max(LIMITS.intendedDifference),
  provenance: z.enum(PROVENANCE_VALUES, {
    message: "Say whether the new version is based on a real task or invented.",
  }),
});

export async function createRelatedAction(
  sourceEpisodeId: string,
  input: { intent: string; intendedDifference: string; provenance: string },
) {
  const parsed = relatedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const settings = await getEventSettings();
  if (!settings.comparisonActivityOpen) {
    return { ok: false as const, message: "Related versions are not open yet." };
  }
  return run(async (userId) => {
    const { episode, session } = await createRelatedVersion({
      sourceEpisodeId,
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
