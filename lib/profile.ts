import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { episode, nomination, profile, reviewResponse, user as userTable } from "@/db/schema";
import { TRACK_VALUES } from "@/lib/nominations";

/**
 * Everything a participant's own profile page shows.
 *
 * One round of queries rather than a chain, because this page is opened
 * mid-event between chats and should not feel like a detour.
 */
export async function getMyProfile(userId: string) {
  const [[account], [details], [work], [reviews], nominations] = await Promise.all([
    db
      .select({
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        createdAt: userTable.createdAt,
        termsVersion: userTable.termsVersion,
        termsAcceptedAt: userTable.termsAcceptedAt,
        dailyTokenBudget: userTable.dailyTokenBudget,
      })
      .from(userTable)
      .where(eq(userTable.id, userId)),
    db.select().from(profile).where(eq(profile.userId, userId)),
    db
      .select({
        started: count(),
        submitted: sql<number>`count(*) filter (where ${episode.status} = 'submitted')`,
      })
      .from(episode)
      .where(eq(episode.userId, userId)),
    // A response row only exists once a review has been submitted.
    db
      .select({ done: count() })
      .from(reviewResponse)
      .where(eq(reviewResponse.reviewerId, userId)),
    // Only the tracks that still exist.
    db
      .select({ track: nomination.track })
      .from(nomination)
      .where(and(eq(nomination.userId, userId), inArray(nomination.track, TRACK_VALUES))),
  ]);

  return {
    account,
    details: details ?? null,
    counts: {
      started: Number(work?.started ?? 0),
      submitted: Number(work?.submitted ?? 0),
      nominations: nominations.map((n) => n.track),
      reviews: Number(reviews?.done ?? 0),
    },
  };
}
