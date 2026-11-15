import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, episode } from "@/db/schema";
import { getEventSettings } from "@/lib/openrouter";

/**
 * Prize entries (form N of the specification): a mark on a participant's
 * own submitted work, and nothing else. No essay, and nothing about the
 * work or how it is reviewed changes when the mark is set or removed.
 */

/** Whether entries can still be made or taken back, and until when. */
export async function prizeEntryStatus() {
  const settings = await getEventSettings();
  const closeAt = settings.nominationsCloseAt;
  const closed =
    settings.nominationsLocked || (closeAt != null && closeAt.getTime() <= Date.now());
  return { closed, closeAt };
}

/** One person's submitted work, newest first, with what the page shows. */
export async function listPrizeCandidates(userId: string) {
  const rows = await db
    .select({
      id: episode.id,
      title: episode.title,
      isFolder: episode.isFolder,
      submittedAt: episode.submittedAt,
      related: sql<boolean>`${episode.creationMethod} = 'related_live'`,
      familyId: episode.sourceFamilyId,
      prizeEntryAt: episode.prizeEntryAt,
      // Sessions that were frozen at submission. One left empty was not.
      sessions: sql<number>`(
        select count(*)::int from ${conversation} c
        where c.episode_id = ${episode.id} and c.status = 'submitted'
      )`,
    })
    .from(episode)
    .where(and(eq(episode.userId, userId), eq(episode.status, "submitted")))
    .orderBy(desc(episode.submittedAt));
  if (rows.length === 0) return [];

  // The first session of each, for the link and for the name of a piece of
  // work that is a single conversation.
  const sessions = await db
    .select({
      id: conversation.id,
      title: conversation.title,
      episodeId: conversation.episodeId,
    })
    .from(conversation)
    .innerJoin(episode, eq(episode.id, conversation.episodeId))
    .where(and(eq(episode.userId, userId), eq(episode.status, "submitted")))
    .orderBy(asc(conversation.sessionOrder));
  const first = new Map<string, { id: string; title: string | null }>();
  for (const s of sessions) {
    if (s.episodeId && !first.has(s.episodeId)) first.set(s.episodeId, s);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.isFolder ? r.title : (first.get(r.id)?.title ?? r.title),
    isFolder: r.isFolder,
    sessions: Number(r.sessions),
    submittedAt: r.submittedAt,
    related: Boolean(r.related),
    familyId: r.familyId,
    entered: r.prizeEntryAt != null,
    sessionId: first.get(r.id)?.id ?? null,
  }));
}
