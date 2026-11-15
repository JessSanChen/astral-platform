import {
  AUTHOR_LABELS_VERSION,
  labelsComplete,
  missingFolderLabels,
  readFolderLabels,
  readLabels,
  readSessionLabels,
  sessionLabelsComplete,
} from "@/lib/author-labels";
import { outer } from "@/lib/sql";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  episode,
  episodeGoalRevision,
  message,
  profile,
  relatedVersion,
  reviewView,
  submission,
  user,
} from "@/db/schema";
import { sessionLetter, type Provenance } from "@/lib/episode-options";

/**
 * Episodes: the unit of work in specification v1.1.
 *
 * An episode is one task. It holds one session (a standalone conversation)
 * or several (a folder), and is submitted once, as a whole. A session is a
 * row of `conversation`; each is an independent chat that never sees the
 * others, the goal note, or anything else kept about the episode.
 */

/** A reply is being written if the last word is the participant's and recent. */
const IN_FLIGHT_SECONDS = 180;

export class EpisodeError extends Error {}

export async function getOwnedEpisode(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(episode)
    .where(and(eq(episode.id, id), eq(episode.userId, userId)));
  if (!row) throw new EpisodeError("That work could not be found.");
  return row;
}

/** Starts a new episode with its first, empty session. */
export async function createEpisode(opts: {
  userId: string;
  modelId: string;
  provenance?: Provenance | null;
  template?: string | null;
  goal?: string | null;
  folder?: boolean;
  /** For a folder: the answers that hold across its sessions. */
  folderLabels?: unknown;
  related?: { sourceEpisodeId: string; familyId: string };
}) {
  return db.transaction(async (tx) => {
    // "Folder 3", counted per person. A standalone conversation is named
    // after its first message instead, as it always has been.
    let title = "Conversation";
    if (opts.folder) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(episode)
        .where(and(eq(episode.userId, opts.userId), eq(episode.isFolder, true)));
      title = `Folder ${n + 1}`;
    }

    const id = crypto.randomUUID();
    const goal = opts.goal?.trim() || null;
    const now = new Date();
    const [created] = await tx
      .insert(episode)
      .values({
        id,
        userId: opts.userId,
        title,
        isFolder: Boolean(opts.folder),
        modelId: opts.modelId,
        taskProvenance: opts.provenance ?? null,
        activityTemplate: opts.template || null,
        goalText: goal,
        goalUpdatedAt: goal ? now : null,
        ...(opts.folder && opts.folderLabels
          ? {
              authorLabels: readFolderLabels(opts.folderLabels),
              authorLabelsVersion: AUTHOR_LABELS_VERSION,
              authorLabelsUpdatedAt: now,
            }
          : {}),
        creationMethod: opts.related ? "related_live" : "original_live",
        // An original starts a family of its own; a related version joins
        // its source's.
        sourceFamilyId: opts.related?.familyId ?? id,
      })
      .returning();
    if (goal) {
      await tx
        .insert(episodeGoalRevision)
        .values({ episodeId: id, goalText: goal, afterWorkBegan: false, savedAt: now });
    }
    const [first] = await tx
      .insert(conversation)
      .values({
        userId: opts.userId,
        modelId: opts.modelId,
        episodeId: id,
        sessionOrder: 1,
        // A folder's session starts from the folder's answers.
        ...(opts.folder && opts.folderLabels
          ? {
              authorLabels: readFolderLabels(opts.folderLabels),
              authorLabelsVersion: AUTHOR_LABELS_VERSION,
              authorLabelsUpdatedAt: now,
            }
          : {}),
      })
      .returning();
    return { episode: created, session: first };
  });
}

/**
 * Adds a session to a draft: a fresh conversation in the same piece of
 * work, on whichever model is asked for.
 *
 * A session starts from the folder's answers about role and kind of task,
 * and can change them. Adding one to a conversation that stood alone
 * turns it into a folder: what its author had said about it becomes what
 * they said about its first session, and the answers that hold across a
 * folder (role, kind of task) start from those.
 */
export async function addSession(episodeId: string, userId: string, modelId?: string) {
  return db.transaction(async (tx) => {
    const [ep] = await tx
      .select()
      .from(episode)
      .where(and(eq(episode.id, episodeId), eq(episode.userId, userId)))
      .for("update");
    if (!ep) throw new EpisodeError("That work could not be found.");
    if (ep.status !== "draft") {
      throw new EpisodeError("This has been submitted, so nothing can be added to it.");
    }
    const now = new Date();
    const [{ next, folders }] = await tx
      .select({
        next: sql<number>`coalesce(max(${conversation.sessionOrder}), 0)::int + 1`,
        folders: sql<number>`(select count(*)::int from ${episode} e where e.user_id = ${userId} and e.is_folder)`,
      })
      .from(conversation)
      .where(eq(conversation.episodeId, episodeId));

    const folderLabels = readFolderLabels(ep.authorLabels);
    let title = ep.title;
    if (!ep.isFolder) {
      title = `Folder ${folders + 1}`;
      // What was said about the conversation goes with the conversation.
      await tx
        .update(conversation)
        .set({
          authorLabels: {
            ...readLabels(ep.authorLabels),
            provenance: ep.taskProvenance ?? "",
            goal: ep.goalText ?? "",
          },
          authorLabelsVersion: AUTHOR_LABELS_VERSION,
          authorLabelsUpdatedAt: now,
        })
        .where(eq(conversation.episodeId, episodeId));
      await tx
        .update(episode)
        .set({
          isFolder: true,
          title,
          authorLabels: folderLabels,
          authorLabelsVersion: AUTHOR_LABELS_VERSION,
          authorLabelsUpdatedAt: now,
          taskProvenance: null,
          goalText: null,
          updatedAt: now,
        })
        .where(eq(episode.id, episodeId));
    }
    const [session] = await tx
      .insert(conversation)
      .values({
        userId,
        modelId: modelId ?? ep.modelId,
        episodeId,
        sessionOrder: next,
        authorLabels: folderLabels,
        authorLabelsVersion: AUTHOR_LABELS_VERSION,
        authorLabelsUpdatedAt: now,
      })
      .returning();
    return { session, episodeTitle: title };
  });
}

/**
 * Saves the author's answers about one session of a folder, as far as
 * they have got. Fixed once the folder is submitted.
 */
export async function saveSessionLabels(conversationId: string, userId: string, raw: unknown) {
  const labels = readSessionLabels(raw);
  const [row] = await db
    .select({ status: episode.status, isFolder: episode.isFolder })
    .from(conversation)
    .innerJoin(episode, eq(episode.id, conversation.episodeId))
    .where(and(eq(conversation.id, conversationId), eq(conversation.userId, userId)));
  if (!row) throw new EpisodeError("That session could not be found.");
  if (row.status !== "draft") {
    throw new EpisodeError("This has been submitted, so it can no longer be changed.");
  }
  await db
    .update(conversation)
    .set({
      authorLabels: labels,
      authorLabelsVersion: AUTHOR_LABELS_VERSION,
      authorLabelsUpdatedAt: new Date(),
    })
    .where(eq(conversation.id, conversationId));
  return { labels };
}

/**
 * Saves the things about a draft that are not messages: its title, whether
 * the task is real or invented, and the optional goal note. Each change of
 * the goal is kept with its time, and with whether work had already begun.
 */
export async function saveEpisodeDetails(
  episodeId: string,
  userId: string,
  patch: { title?: string; provenance?: Provenance; goal?: string | null },
) {
  return db.transaction(async (tx) => {
    const [ep] = await tx
      .select()
      .from(episode)
      .where(and(eq(episode.id, episodeId), eq(episode.userId, userId)))
      .for("update");
    if (!ep) throw new EpisodeError("That work could not be found.");
    if (ep.status !== "draft") {
      throw new EpisodeError("This has been submitted, so it can no longer be changed.");
    }
    const now = new Date();
    const set: Partial<typeof episode.$inferInsert> = { updatedAt: now };

    if (patch.title !== undefined && patch.title.trim() && patch.title.trim() !== ep.title) {
      set.title = patch.title.trim();
    }
    if (patch.provenance && patch.provenance !== ep.taskProvenance) {
      set.taskProvenance = patch.provenance;
      set.provenanceChangedAt = now;
    }
    if (patch.goal !== undefined) {
      const goal = patch.goal?.trim() || null;
      if (goal !== (ep.goalText ?? null)) {
        const [{ sent }] = await tx
          .select({ sent: sql<number>`count(*)::int` })
          .from(message)
          .innerJoin(conversation, eq(conversation.id, message.conversationId))
          .where(eq(conversation.episodeId, episodeId));
        set.goalText = goal;
        set.goalUpdatedAt = now;
        await tx.insert(episodeGoalRevision).values({
          episodeId,
          goalText: goal,
          afterWorkBegan: sent > 0,
          savedAt: now,
        });
      }
    }
    await tx.update(episode).set(set).where(eq(episode.id, episodeId));
    return { savedAt: now };
  });
}

/**
 * Saves the author's answers about their work, as far as they have got.
 * Anything may be left unanswered until submitting; nothing can be changed
 * after.
 */
export async function saveAuthorLabels(episodeId: string, userId: string, raw: unknown) {
  const [kind] = await db
    .select({ isFolder: episode.isFolder })
    .from(episode)
    .where(and(eq(episode.id, episodeId), eq(episode.userId, userId)));
  // A folder is asked less: only what holds across its sessions.
  const labels = kind?.isFolder ? readFolderLabels(raw) : readLabels(raw);
  const [saved] = await db
    .update(episode)
    .set({
      authorLabels: labels,
      authorLabelsVersion: AUTHOR_LABELS_VERSION,
      authorLabelsUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(episode.id, episodeId), eq(episode.userId, userId), eq(episode.status, "draft")))
    .returning({ id: episode.id });
  if (!saved) {
    // Not theirs, not there, or already submitted: which, is for them.
    const ep = await getOwnedEpisode(episodeId, userId);
    if (ep.status !== "draft") {
      throw new EpisodeError("This has been submitted, so it can no longer be changed.");
    }
    throw new EpisodeError("That work could not be found.");
  }
  return { labels };
}

type SessionSummary = {
  id: string;
  order: number;
  title: string;
  modelId: string;
  authorLabels: unknown;
  messages: number;
  userMessages: number;
  lastRole: string | null;
  lastAt: Date | null;
};

/** The sessions of an episode, with enough to say which would be submitted. */
export async function listSessions(episodeId: string): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: conversation.id,
      order: conversation.sessionOrder,
      title: conversation.title,
      modelId: conversation.modelId,
      authorLabels: conversation.authorLabels,
      messages: sql<number>`(
        select count(*)::int from ${message} m
        where m.conversation_id = ${outer(conversation.id)} and m.superseded_by is null
      )`,
      userMessages: sql<number>`(
        select count(*)::int from ${message} m
        where m.conversation_id = ${outer(conversation.id)} and m.superseded_by is null and m.role = 'user'
      )`,
      lastRole: sql<string | null>`(
        select m.role::text from ${message} m
        where m.conversation_id = ${outer(conversation.id)} and m.superseded_by is null
        order by m.seq desc limit 1
      )`,
      lastAt: sql<Date | null>`(
        select m.created_at from ${message} m
        where m.conversation_id = ${outer(conversation.id)} and m.superseded_by is null
        order by m.seq desc limit 1
      )`,
    })
    .from(conversation)
    .where(eq(conversation.episodeId, episodeId))
    .orderBy(asc(conversation.sessionOrder));
  return rows.map((r) => ({ ...r, lastAt: r.lastAt ? new Date(r.lastAt) : null }));
}

/** True while a reply to the session's last message may still be arriving. */
export function replyInFlight(session: { lastRole: string | null; lastAt: Date | null }) {
  return (
    session.lastRole === "user" &&
    session.lastAt != null &&
    Date.now() - session.lastAt.getTime() < IN_FLIGHT_SECONDS * 1000
  );
}

export type ViewTurn = {
  /** The number shown beside it in this view. */
  n: number;
  /** A neutral session name, for a view of several sessions; else null. */
  session: string | null;
  role: "user" | "assistant";
  content: string;
  messageId: string;
  at: string;
  /** How the turn ended: a reply can be empty, cut short, or an error. */
  finishReason: string | null;
  failed: boolean;
};
export type ViewContent = { kind: "session" | "linked"; sessions: string[]; turns: ViewTurn[] };

/**
 * Submits an episode: once, and for good.
 *
 * Every session with at least one message from the participant is frozen,
 * including one whose reply failed or was cut short, which stays in the
 * record as what it was. Empty sessions are left behind. Nothing here asks
 * whether the conversation went well.
 *
 * What reviewers will be shown is written out at the same moment, as views
 * that never change afterwards: each session by itself and, for a folder
 * with more than one, all of them together in the order things actually
 * happened.
 */
export async function submitEpisode(episodeId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [ep] = await tx
      .select()
      .from(episode)
      .where(and(eq(episode.id, episodeId), eq(episode.userId, userId)))
      .for("update");
    if (!ep) throw new EpisodeError("That work could not be found.");
    if (ep.status === "submitted") return { episode: ep, already: true as const };

    const sessions = await tx
      .select()
      .from(conversation)
      .where(eq(conversation.episodeId, episodeId))
      .orderBy(asc(conversation.sessionOrder))
      .for("update");
    const messages = sessions.length
      ? await tx
          .select()
          .from(message)
          .where(
            and(
              inArray(
                message.conversationId,
                sessions.map((s) => s.id),
              ),
              isNull(message.supersededBy),
            ),
          )
          .orderBy(asc(message.createdAt), asc(message.seq))
      : [];

    const bySession = new Map<string, typeof messages>();
    for (const m of messages) {
      const list = bySession.get(m.conversationId);
      if (list) list.push(m);
      else bySession.set(m.conversationId, [m]);
    }
    const included = sessions.filter((s) =>
      (bySession.get(s.id) ?? []).some((m) => m.role === "user"),
    );
    if (included.length === 0) {
      throw new EpisodeError("Send at least one message before submitting.");
    }
    // The author's own account of the work goes in with it, complete. A
    // folder answers a little for itself and the rest for each session.
    if (ep.isFolder) {
      if (Object.keys(missingFolderLabels(readFolderLabels(ep.authorLabels))).length > 0) {
        throw new EpisodeError(
          "Answer the folder's own questions first: open the folder from the list on the left.",
        );
      }
      const unanswered = included.filter(
        (s) => !sessionLabelsComplete(readSessionLabels(s.authorLabels)),
      );
      if (unanswered.length > 0) {
        throw new EpisodeError(
          `Session${unanswered.length === 1 ? "" : "s"} ${unanswered
            .map((s) => s.sessionOrder)
            .join(", ")} still ${unanswered.length === 1 ? "has" : "have"} unanswered questions. Open ${unanswered.length === 1 ? "it" : "each"} and answer them, then submit.`,
        );
      }
    } else if (!ep.taskProvenance || !labelsComplete(readLabels(ep.authorLabels))) {
      throw new EpisodeError(
        "Answer the questions in the panel about this work before submitting. They are marked.",
      );
    }
    for (const s of included) {
      const list = bySession.get(s.id)!;
      const last = list[list.length - 1];
      if (
        last.role === "user" &&
        Date.now() - last.createdAt.getTime() < IN_FLIGHT_SECONDS * 1000
      ) {
        throw new EpisodeError(
          "A reply is still being written. Wait for it to finish, then submit.",
        );
      }
    }

    const now = new Date();
    // What the author said about each session. For a conversation that
    // stands alone that is what they said about the work, written onto the
    // session now so that every submitted session carries its own answers.
    const sessionLabelsAtSubmit = (s: (typeof included)[number]) =>
      ep.isFolder
        ? readSessionLabels(s.authorLabels)
        : readSessionLabels({
            ...readLabels(ep.authorLabels),
            provenance: ep.taskProvenance ?? "",
            goal: ep.goalText ?? "",
          });
    if (!ep.isFolder) {
      for (const s of included) {
        await tx
          .update(conversation)
          .set({
            authorLabels: sessionLabelsAtSubmit(s),
            authorLabelsVersion: AUTHOR_LABELS_VERSION,
            authorLabelsUpdatedAt: now,
          })
          .where(eq(conversation.id, s.id));
      }
    }
    const [author] = await tx
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    const [authorProfile] = await tx.select().from(profile).where(eq(profile.userId, userId));

    // The frozen record of each session, in the table submissions have
    // always lived in. One version, because there is only one submission.
    for (const s of included) {
      const list = bySession.get(s.id)!;
      await tx.insert(submission).values({
        conversationId: s.id,
        version: 1,
        submittedAt: now,
        snapshot: {
          conversationId: s.id,
          episodeId,
          version: 1,
          modelId: s.modelId,
          scenario: s.scenario,
          title: s.title,
          sessionOrder: s.sessionOrder,
          sessionLabels: sessionLabelsAtSubmit(s),
          episode: {
            title: ep.title,
            isFolder: ep.isFolder,
            taskProvenance: ep.taskProvenance,
            activityTemplate: ep.activityTemplate,
            goalText: ep.goalText,
            authorLabels: ep.authorLabels,
            authorLabelsVersion: ep.authorLabelsVersion,
            creationMethod: ep.creationMethod,
            sourceFamilyId: ep.sourceFamilyId,
          },
          participant: {
            userId,
            name: author?.name,
            email: author?.email,
            intake: authorProfile?.intake ?? null,
            intakeVersion: authorProfile?.intakeVersion ?? null,
          },
          messages: list.map((m, i) => ({
            id: m.id,
            seq: m.seq,
            turn: i + 1,
            role: m.role,
            content: m.content,
            modelId: m.modelId,
            provider: m.provider,
            generationId: m.generationId,
            finishReason: m.finishReason,
            promptTokens: m.promptTokens,
            completionTokens: m.completionTokens,
            reasoningTokens: m.reasoningTokens,
            costUsd: m.costUsd,
            latencyMs: m.latencyMs,
            error: m.error,
            createdAt: m.createdAt,
          })),
          submittedAt: now,
        },
      });
    }
    await tx
      .update(conversation)
      .set({
        status: "submitted",
        currentVersion: 1,
        firstSubmittedAt: now,
        lastSubmittedAt: now,
        lockedAt: now,
        updatedAt: now,
      })
      .where(
        inArray(
          conversation.id,
          included.map((s) => s.id),
        ),
      );

    // What reviewers see. Titles, the goal note and everything else about
    // the author's intentions are deliberately not in here.
    const turn = (m: (typeof messages)[number], n: number, session: string | null): ViewTurn => ({
      n,
      session,
      role: m.role,
      content: m.content,
      messageId: m.id,
      at: m.createdAt.toISOString(),
      finishReason: m.finishReason,
      failed: m.error != null,
    });
    const letter = new Map(included.map((s, i) => [s.id, sessionLetter(i + 1)]));
    const views: (typeof reviewView.$inferInsert)[] = [];
    const addView = (content: ViewContent, conversationId: string | null) =>
      views.push({
        episodeId,
        familyId: ep.sourceFamilyId,
        kind: content.kind,
        conversationId,
        content,
        contentHash: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
      });

    for (const s of included) {
      addView(
        {
          kind: "session",
          sessions: [],
          turns: bySession.get(s.id)!.map((m, i) => turn(m, i + 1, null)),
        },
        s.id,
      );
    }
    if (included.length > 1) {
      const ids = new Set(included.map((s) => s.id));
      addView(
        {
          kind: "linked",
          sessions: included.map((s) => letter.get(s.id)!),
          // Already in the order things happened across the whole folder.
          turns: messages
            .filter((m) => ids.has(m.conversationId))
            .map((m, i) => turn(m, i + 1, letter.get(m.conversationId)!)),
        },
        null,
      );
    }
    await tx.insert(reviewView).values(views);

    const [submitted] = await tx
      .update(episode)
      .set({
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
        // Available to every reviewer at once. Nobody decides who is able
        // to review what: a reviewer who finds it outside their expertise
        // skips it. An organizer can still hold one back or withdraw it.
        assignmentState: "ready",
        reviewLevel: "general",
      })
      .where(eq(episode.id, episodeId))
      .returning();

    return { episode: submitted, already: false as const, sessions: included.length };
  });
}

/**
 * Starts a related version of a submitted episode: a new, empty episode in
 * the same family, on the same model. None of the source's messages go with
 * it; the link is the only connection.
 */
export async function createRelatedVersion(opts: {
  sourceEpisodeId: string;
  userId: string;
  intent: string;
  intendedDifference: string;
}) {
  const source = await getOwnedEpisode(opts.sourceEpisodeId, opts.userId);
  if (source.status !== "submitted") {
    throw new EpisodeError("Submit the original first: a related version is made from a submission.");
  }
  const { episode: created, session } = await createEpisode({
    userId: opts.userId,
    modelId: source.modelId,
    // Whether the task is real starts as the original's answer and can be
    // changed in the panel. In a folder each session answers for itself.
    provenance: source.isFolder ? null : (source.taskProvenance as Provenance | null),
    // A related version of a folder starts as a folder, ready for more
    // sessions; of a conversation, as a conversation.
    folder: source.isFolder,
    // The answers that held across the original folder are where its
    // related version starts; they can be changed.
    folderLabels: source.isFolder ? source.authorLabels : undefined,
    related: { sourceEpisodeId: source.id, familyId: source.sourceFamilyId },
  });
  await db.insert(relatedVersion).values({
    sourceEpisodeId: source.id,
    targetEpisodeId: created.id,
    familyId: source.sourceFamilyId,
    comparisonIntent: opts.intent,
    intendedDifference: opts.intendedDifference,
    createdBy: opts.userId,
  });
  return { episode: created, session };
}

/** Everything of one person's, for the list down the side: newest first. */
export async function listMyWork(userId: string) {
  return db
    .select({
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      sessionOrder: conversation.sessionOrder,
      lastMessageAt: conversation.lastMessageAt,
      updatedAt: conversation.updatedAt,
      episodeId: episode.id,
      episodeTitle: episode.title,
      isFolder: episode.isFolder,
      episodeStatus: episode.status,
      creationMethod: episode.creationMethod,
      episodeCreatedAt: episode.createdAt,
    })
    .from(conversation)
    .innerJoin(episode, eq(episode.id, conversation.episodeId))
    .where(eq(conversation.userId, userId))
    .orderBy(desc(episode.createdAt), asc(conversation.sessionOrder));
}

/**
 * Changes what a related version says it set out to change. Allowed while
 * the related version is still a draft: once it is submitted, what it
 * said is part of the record. That it was revised, and when, is kept.
 */
export async function reviseRelatedIntent(opts: {
  targetEpisodeId: string;
  userId: string;
  intent: string;
  intendedDifference: string;
}) {
  const target = await getOwnedEpisode(opts.targetEpisodeId, opts.userId);
  if (target.status !== "draft") {
    throw new EpisodeError("This has been submitted, so it can no longer be changed.");
  }
  const [revised] = await db
    .update(relatedVersion)
    .set({
      comparisonIntent: opts.intent,
      intendedDifference: opts.intendedDifference,
      intentRevisedAt: new Date(),
    })
    .where(
      and(
        eq(relatedVersion.targetEpisodeId, target.id),
        // Unchanged answers are not a revision.
        sql`(${relatedVersion.comparisonIntent}, ${relatedVersion.intendedDifference}) is distinct from (${opts.intent}, ${opts.intendedDifference})`,
      ),
    )
    .returning({ id: relatedVersion.id });
  return { changed: Boolean(revised) };
}

/** The related-version links an episode takes part in, either way round. */
export async function relatedLinks(episodeId: string) {
  const rows = await db
    .select({
      id: relatedVersion.id,
      sourceEpisodeId: relatedVersion.sourceEpisodeId,
      targetEpisodeId: relatedVersion.targetEpisodeId,
      comparisonIntent: relatedVersion.comparisonIntent,
      intendedDifference: relatedVersion.intendedDifference,
      createdAt: relatedVersion.createdAt,
    })
    .from(relatedVersion)
    .where(
      sql`${relatedVersion.sourceEpisodeId} = ${episodeId} or ${relatedVersion.targetEpisodeId} = ${episodeId}`,
    )
    .orderBy(asc(relatedVersion.createdAt));
  return rows;
}
