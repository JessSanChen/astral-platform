import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  nomination,
  profile,
  review,
  user as userTable,
} from "@/db/schema";

/**
 * Everything a participant's own profile page shows.
 *
 * One round of queries rather than a chain, because this page is opened
 * mid-event between chats and should not feel like a detour.
 */
export async function getMyProfile(userId: string) {
  const [[account], [details], [transcripts], [reviews], nominations] =
    await Promise.all([
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
          submitted: sql<number>`count(*) filter (where ${conversation.status} = 'submitted')`,
        })
        .from(conversation)
        .where(eq(conversation.userId, userId)),
      // A review row only exists once it has been submitted, so counting
      // rows is the count of finished reviews.
      db
        .select({ done: count() })
        .from(review)
        .where(eq(review.reviewerId, userId)),
      db
        .select({ track: nomination.track })
        .from(nomination)
        .where(eq(nomination.userId, userId)),
    ]);

  return {
    account,
    details: details ?? null,
    counts: {
      started: Number(transcripts?.started ?? 0),
      submitted: Number(transcripts?.submitted ?? 0),
      reviews: Number(reviews?.done ?? 0),
      nominations: nominations.map((n) => n.track),
    },
  };
}
