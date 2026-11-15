import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { nomination } from "@/db/schema";
import { getEventSettings } from "@/lib/openrouter";

export const NOMINATION_TRACKS = [
  {
    value: "adversarial",
    label: "Adversarial use cases",
    blurb:
      "The most interesting, relevant or impactful finding about an adversarial actor. Breadth of testing counts as well as any single result.",
  },
  {
    value: "dual_use",
    label: "Dual-use use cases",
    blurb:
      "The most interesting, relevant or impactful finding about dual use, where a legitimate purpose and a harmful one are served by the same answer.",
  },
] as const;

// There was a third track, "collaborative". It was dropped before the
// event. The database still accepts the value, because entries were made in
// it while it existed and they are still in the export, but nothing in the
// interface offers it or lists it.

export type TrackValue = (typeof NOMINATION_TRACKS)[number]["value"];

/** The tracks that exist, for queries that should not count retired ones. */
export const TRACK_VALUES = NOMINATION_TRACKS.map((t) => t.value);

export function trackLabel(track: string) {
  return NOMINATION_TRACKS.find((t) => t.value === track)?.label ?? track;
}

/** Whether nominations are closed, and why, so the reason can be shown. */
export async function nominationStatus() {
  const settings = await getEventSettings();
  const closeAt = settings.nominationsCloseAt;
  const pastDeadline = closeAt ? Date.now() >= closeAt.getTime() : false;
  return {
    locked: settings.nominationsLocked || pastDeadline,
    closedByOrganizer: settings.nominationsLocked,
    closeAt,
  };
}

export async function listMyNominations(userId: string) {
  // Only the tracks that still exist.
  return db
    .select()
    .from(nomination)
    .where(
      and(
        eq(nomination.userId, userId),
        inArray(nomination.track, TRACK_VALUES),
      ),
    );
}

export async function getNomination(userId: string, track: TrackValue) {
  const [row] = await db
    .select()
    .from(nomination)
    .where(and(eq(nomination.userId, userId), eq(nomination.track, track)));
  return row ?? null;
}

