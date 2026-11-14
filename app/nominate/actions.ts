"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { nomination } from "@/db/schema";
import { requireOnboarded } from "@/lib/gate";
import { NOMINATION_TRACKS, nominationStatus, type TrackValue } from "@/lib/nominations";

const tracks = NOMINATION_TRACKS.map((t) => t.value) as [string, ...string[]];

const schema = z.object({
  track: z.enum(tracks),
  headline: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z
      .string()
      .min(1, "Give your finding a headline.")
      .max(200, "Keep the headline under 200 characters."),
  ),
  details: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string().min(1, "Describe the finding."),
  ),
  slidesUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .refine(
      (v) => !v || /^https?:\/\/\S+$/i.test(v),
      "That does not look like a link. Paste the full address, starting with https://",
    ),
});

export type NominationState = {
  errors?: Record<string, string>;
  message?: string;
  savedAt?: number;
  /** Refused because nominations are closed. */
  closed?: boolean;
  submissionCount?: number;
};

export async function submitNomination(
  _prev: NominationState,
  formData: FormData,
): Promise<NominationState> {
  const { user } = await requireOnboarded();

  const status = await nominationStatus();
  if (status.locked) {
    return {
      closed: true,
      message:
        "Nominations are closed. Your existing entry is still here to read, but it can no longer be changed.",
    };
  }

  const parsed = schema.safeParse({
    track: formData.get("track"),
    headline: formData.get("headline"),
    details: formData.get("details"),
    slidesUrl: formData.get("slidesUrl") ?? undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { errors, message: "Please complete the highlighted fields." };
  }

  const v = parsed.data;
  const now = new Date();

  const [saved] = await db
    .insert(nomination)
    .values({
      userId: user.id,
      track: v.track as TrackValue,
      headline: v.headline,
      details: v.details,
      slidesUrl: v.slidesUrl || null,
      submittedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [nomination.userId, nomination.track],
      set: {
        headline: v.headline,
        details: v.details,
        slidesUrl: v.slidesUrl || null,
        updatedAt: now,
        submissionCount: sql`${nomination.submissionCount} + 1`,
      },
    })
    .returning({ submissionCount: nomination.submissionCount });

  return { submissionCount: saved?.submissionCount ?? 1, savedAt: Date.now() };
}

export async function myNomination(track: TrackValue) {
  const { user } = await requireOnboarded();
  const [row] = await db
    .select()
    .from(nomination)
    .where(and(eq(nomination.userId, user.id), eq(nomination.track, track)));
  return row ?? null;
}
