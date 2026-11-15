import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { nomination } from "@/db/schema";
import { getEventSettings } from "@/lib/openrouter";

/**
 * The awards. The quantitative ones are counted by the platform and need
 * no entry. The qualitative ones are decided by nomination: a written
 * entry on the Submit page.
 */
export const AWARDS: { award: string; type: "Quantitative" | "Qualitative"; rewarding: string; note?: string }[] = [
  {
    award: "Most Qualified Transcripts",
    type: "Quantitative",
    rewarding: "Producing a large number of distinct, substantive, usable conversations",
  },
  {
    award: "Most Qualified Reviews",
    type: "Quantitative",
    rewarding: "Completing many careful, evidence-grounded independent transcript reviews",
  },
  {
    award: "Most Qualified Comparisons",
    type: "Quantitative",
    rewarding: "Completing many careful comparisons of pairs of related conversations",
    note: "Smaller prize pool",
  },
  {
    award: "Most Interesting AI Risk Finding",
    type: "Qualitative",
    rewarding:
      "Revealing an important limitation, ambiguity, or potential risk of AI assistance in dual-use or fictional adversarial scenarios",
  },
  {
    award: "Best Comparative Investigation",
    type: "Qualitative",
    rewarding:
      "Using related versions or matched conversations to investigate how changes in context, wording, or task affect observable behavior or review judgments",
  },
  {
    award: "Best Multi-Session Investigation",
    type: "Qualitative",
    rewarding:
      "Exploring how a larger goal develops across multiple sessions, including decomposition, accumulation of context, or changes in observable evidence",
  },
];

/** The three qualitative awards, each entered by describing what was found. */
export const NOMINATION_TRACKS = [
  {
    value: "ai_risk_finding",
    label: "Most Interesting AI Risk Finding",
    question: "What did you discover?",
    blurb:
      "Revealing an important limitation, ambiguity, or potential risk of AI assistance in dual-use or fictional adversarial scenarios.",
    focus:
      "The focus is a substantive insight about the potential risks or limitations of AI assistance. It might concern the interpretation of dual-use activity, uncertainty about purpose, or what information the conversation reveals. It does not require a successful harmful output or a confirmed monitor failure.",
  },
  {
    value: "comparative",
    label: "Best Comparative Investigation",
    question: "What changes the result?",
    blurb:
      "Using related versions or matched conversations to investigate how changes in context, wording, or task affect observable behavior or review judgments.",
    focus:
      "The focus is a meaningful comparison among conversations or related versions. For example, you might examine how a non-operational change in stated context changes human judgments, or how presentation differences affect the assistant's response. Strong entries explain what was controlled and what was not.",
  },
  {
    value: "multi_session",
    label: "Best Multi-Session Investigation",
    question: "What emerges across sessions?",
    blurb:
      "Exploring how a larger goal develops across multiple sessions, including decomposition, accumulation of context, or changes in observable evidence.",
    focus:
      "The focus is how related sessions contribute to one overarching goal or reveal information that is not apparent from individual sessions. Strong entries show why the linkage matters, rather than merely splitting an ordinary conversation into several chats.",
  },
] as const;

// Earlier tracks ("adversarial", "dual_use", and before them
// "collaborative") were replaced by these. The database still accepts the
// old values, because entries were made in them, but nothing in the
// interface offers or lists them.

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

