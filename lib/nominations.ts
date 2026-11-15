import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { nomination } from "@/db/schema";
import { getEventSettings } from "@/lib/openrouter";

/**
 * The awards. The quantitative ones are counted by the platform and need
 * no entry. The qualitative ones are decided by nomination: a written
 * entry on the Submit page.
 */
export const AWARDS: { award: string; type: "Quantitative" | "Qualitative"; rewarding: string }[] = [
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
  },
  {
    award: "Best Investigation: Matched Set",
    type: "Qualitative",
    rewarding:
      "Using related versions or matched conversations to investigate how changes in context, wording, or task affect observable behavior or review judgments",
  },
  {
    award: "Best Investigation: Multi-Session",
    type: "Qualitative",
    rewarding:
      "Exploring how a larger goal develops across multiple sessions, including decomposition, accumulation of context, or changes in observable evidence",
  },
  {
    award: "Best Investigation: General",
    type: "Qualitative",
    rewarding:
      "Any other well-evidenced investigation of how AI assistants behave in scientific work, whatever the scenario: ordinary and benign use is as welcome as anything else",
  },
];

/**
 * The three qualitative awards, each entered by describing what was found.
 *
 * `value` is what is stored and does not change when an award is renamed.
 * `slug` is what appears in the address, and follows the award's name.
 * The General award keeps the stored value of the award it took the place
 * of ("ai_risk_finding"), so entries already made are still under it.
 */
export const NOMINATION_TRACKS = [
  {
    value: "comparative",
    slug: "matched_set",
    label: "Best Investigation: Matched Set",
    question: "What changes the result?",
    blurb:
      "Using related versions or matched conversations to investigate how changes in context, wording, or task affect observable behavior or review judgments.",
    focus:
      "The focus is a meaningful comparison among conversations or related versions. For example, you might examine how a non-operational change in stated context changes human judgments, or how presentation differences affect the assistant's response. Strong entries explain what was controlled and what was not.",
  },
  {
    value: "multi_session",
    slug: "multi_session",
    label: "Best Investigation: Multi-Session",
    question: "What emerges across sessions?",
    blurb:
      "Exploring how a larger goal develops across multiple sessions, including decomposition, accumulation of context, or changes in observable evidence.",
    focus:
      "The focus is how related sessions contribute to one overarching goal or reveal information that is not apparent from individual sessions. Strong entries show why the linkage matters, rather than merely splitting an ordinary conversation into several chats.",
  },
  {
    value: "ai_risk_finding",
    slug: "general",
    label: "Best Investigation: General",
    question: "What did you find?",
    blurb:
      "Any other well-evidenced investigation of how AI assistants behave in scientific work. A catch-all for work that is neither a matched set nor a multi-session study.",
    focus:
      "The focus is a clear question, what you did to look into it, and what you found. The scenario can be anything: ordinary, benign use of an assistant is as welcome as dual-use or adversarial work, and an entry does not have to be about a risk or a failure. Strong entries say what the evidence does and does not show.",
  },
] as const;

/** The award an address names: by its slug, or by the value stored for it. */
export function trackFromAddress(part: string) {
  return (
    NOMINATION_TRACKS.find((t) => t.slug === part) ??
    NOMINATION_TRACKS.find((t) => t.value === part) ??
    null
  );
}

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

