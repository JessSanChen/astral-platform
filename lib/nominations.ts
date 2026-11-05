import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { nomination, user } from "@/db/schema";
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
  {
    value: "collaborative",
    label: "Linked or collaborative use cases",
    blurb:
      "A finding that came out of working with other participants. Say what the collaboration produced that neither of you would have found alone.",
  },
] as const;

export type TrackValue = (typeof NOMINATION_TRACKS)[number]["value"];

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
  return db.select().from(nomination).where(eq(nomination.userId, userId));
}

export async function getNomination(userId: string, track: TrackValue) {
  const [row] = await db
    .select()
    .from(nomination)
    .where(and(eq(nomination.userId, userId), eq(nomination.track, track)));
  return row ?? null;
}

/** Participant names, offered as suggestions when naming collaborators. */
export async function participantNames(excludeUserId: string) {
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.name));
  return rows.filter((r) => r.id !== excludeUserId).map((r) => r.name);
}
