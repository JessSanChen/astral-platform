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
        // A folder's session starts from the folder's answers. A
        // conversation's session carries a copy of what its episode holds.
        ...(opts.folder && opts.folderLabels
          ? {
              authorLabels: readFolderLabels(opts.folderLabels),
              authorLabelsVersion: AUTHOR_LABELS_VERSION,
              authorLabelsUpdatedAt: now,
            }
          : !opts.folder && (created.taskProvenance || created.goalText)
            ? {
                authorLabels: standaloneSessionLabels(created),
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
 * A conversation that stands alone keeps its author's answers on its
 * episode. This is the same account in the shape a session carries, so
 * its one session can hold a copy and every session reads the same way.
 */
function standaloneSessionLabels(ep: {
  authorLabels: unknown;
  taskProvenance: string | null;
  goalText: string | null;
}) {
  return readSessionLabels({
    ...readLabels(ep.authorLabels),
    provenance: ep.taskProvenance ?? "",
    goal: ep.goalText ?? "",
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Brings a standalone conversation's session up to date with its episode,
 * after any change to the answers, so the copy is never behind: a draft
 * read from the session says what its author last said, not what they had
 * said at some earlier point. Does nothing for a folder, whose sessions
 * answer for themselves.
 */
async function mirrorOntoSession(
  run: Tx | typeof db,
  ep: {
    id: string;
    isFolder: boolean;
    authorLabels: unknown;
    taskProvenance: string | null;
    goalText: string | null;
  },
  now: Date,
) {
  if (ep.isFolder) return;
  await run
    .update(conversation)
    .set({
      authorLabels: standaloneSessionLabels(ep),
      authorLabelsVersion: AUTHOR_LABELS_VERSION,
      authorLabelsUpdatedAt: now,
    })
    .where(eq(conversation.episodeId, ep.id));
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
      // What was said about the conversation goes with the conversation,
      // and so does the record of when: when its real-or-invented answer
      // last changed, and each saved version of its goal.
      const [firstSession] = await tx
        .update(conversation)
        .set({
          authorLabels: standaloneSessionLabels(ep),
          authorLabelsVersion: AUTHOR_LABELS_VERSION,
          authorLabelsUpdatedAt: now,
          provenanceChangedAt: ep.provenanceChangedAt,
        })
        .where(eq(conversation.episodeId, episodeId))
        .returning({ id: conversation.id });
      if (firstSession) {
        await tx
          .update(episodeGoalRevision)
          .set({ conversationId: firstSession.id })
          .where(
            and(
              eq(episodeGoalRevision.episodeId, episodeId),
              isNull(episodeGoalRevision.conversationId),
            ),
          );
      }
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
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        episodeId: episode.id,
        status: episode.status,
        sessionStatus: conversation.status,
        stored: conversation.authorLabels,
      })
      .from(conversation)
      .innerJoin(episode, eq(episode.id, conversation.episodeId))
      .where(and(eq(conversation.id, conversationId), eq(conversation.userId, userId)))
      // The folder is held until this is written, so that submitting it
      // and saving an answer cannot cross: whichever comes second sees
      // what the first did.
      .for("update", { of: episode });
    if (!row) throw new EpisodeError("That session could not be found.");
    if (row.status !== "draft" || row.sessionStatus !== "draft") {
      throw new EpisodeError("This has been submitted, so it can no longer be changed.");
    }
    const before = readSessionLabels(row.stored);
    // Whether the task was real is no longer asked. An answer given while
    // it was is kept, not wiped by the next save.
    if (!labels.provenance) labels.provenance = before.provenance;
    const now = new Date();

    // A changed goal is kept as a revision, with whether the session had
    // begun: a goal written afterwards is context, not a plan made in
    // advance. The same record a conversation's goal has always had.
    if (labels.goal !== before.goal) {
      const [{ sent }] = await tx
        .select({ sent: sql<number>`count(*)::int` })
        .from(message)
        .where(eq(message.conversationId, conversationId));
      await tx.insert(episodeGoalRevision).values({
        episodeId: row.episodeId,
        conversationId,
        goalText: labels.goal || null,
        afterWorkBegan: sent > 0,
        savedAt: now,
      });
    }

    await tx
      .update(conversation)
      .set({
        authorLabels: labels,
        authorLabelsVersion: AUTHOR_LABELS_VERSION,
        authorLabelsUpdatedAt: now,
        ...(labels.provenance !== before.provenance ? { provenanceChangedAt: now } : {}),
      })
      .where(eq(conversation.id, conversationId));
    return { labels };
  });
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
    if (set.taskProvenance !== undefined || set.goalText !== undefined) {
      await mirrorOntoSession(tx, { ...ep, ...set } as typeof ep, now);
    }
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
    .returning({
      id: episode.id,
      isFolder: episode.isFolder,
      authorLabels: episode.authorLabels,
      taskProvenance: episode.taskProvenance,
      goalText: episode.goalText,
    });
  if (saved) await mirrorOntoSession(db, saved, new Date());
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
  status: string;
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
      status: conversation.status,
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
export async function submitEpisode(episodeId: string, userId: string, onlySessionId?: string) {
  return db.transaction(async (tx) => {
    const [ep] = await tx
      .select()
      .from(episode)
      .where(and(eq(episode.id, episodeId), eq(episode.userId, userId)))
      .for("update");
    if (!ep) throw new EpisodeError("That work could not be found.");
    if (ep.status === "submitted") return { episode: ep, already: true as const, sessions: 0 };

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
    const hasWork = (s: (typeof sessions)[number]) =>
      (bySession.get(s.id) ?? []).some((m) => m.role === "user");

    // One session of a folder, by itself. For a conversation that stands
    // alone the session is the whole of the work, so it is submitted as
    // such.
    const only = onlySessionId && ep.isFolder ? sessions.find((s) => s.id === onlySessionId) : undefined;
    if (onlySessionId && ep.isFolder && !only) {
      throw new EpisodeError("That session could not be found.");
    }
    if (only?.status === "submitted") {
      return { episode: ep, already: true as const, sessions: 0 };
    }

    // Everything with work in it, whether or not it went in earlier by
    // itself; and what is being fixed now.
    const included = sessions.filter(hasWork);
    const freezing = only
      ? included.filter((s) => s.id === only.id)
      : included.filter((s) => s.status !== "submitted");
    if ((only ? freezing : included).length === 0) {
      throw new EpisodeError("Send at least one message before submitting.");
    }
    // The author's own account of the work goes in with it, complete. A
    // folder answers a little for itself and the rest for each session.
    if (ep.isFolder) {
      if (!only && Object.keys(missingFolderLabels(readFolderLabels(ep.authorLabels))).length > 0) {
        throw new EpisodeError(
          "Answer the folder's own questions first: open the folder from the list on the left.",
        );
      }
      const unanswered = freezing.filter(
        (s) => !sessionLabelsComplete(readSessionLabels(s.authorLabels)),
      );
      if (unanswered.length > 0) {
        throw new EpisodeError(
          only
            ? "Answer the questions in the panel about this conversation before submitting. They are marked."
            : `Session${unanswered.length === 1 ? "" : "s"} ${unanswered
                .map((s) => s.sessionOrder)
                .join(", ")} still ${unanswered.length === 1 ? "has" : "have"} unanswered questions. Open ${unanswered.length === 1 ? "it" : "each"} and answer them, then submit.`,
        );
      }
    } else if (!labelsComplete(readLabels(ep.authorLabels))) {
      throw new EpisodeError(
        "Answer the questions in the panel about this work before submitting. They are marked.",
      );
    }
    for (const s of freezing) {
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
        : standaloneSessionLabels(ep);
    if (!ep.isFolder) {
      for (const s of freezing) {
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
    // always lived in. One version, because a session is submitted once.
    for (const s of freezing) {
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
    if (freezing.length > 0) {
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
            freezing.map((s) => s.id),
          ),
        );
    }

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

    // A session submitted earlier by itself already has its view.
    for (const s of freezing) {
      addView(
        {
          kind: "session",
          sessions: [],
          turns: bySession.get(s.id)!.map((m, i) => turn(m, i + 1, null)),
        },
        s.id,
      );
    }
    // The folder read as a whole exists once the folder itself is
    // submitted, and takes in every session with work in it.
    if (!only && included.length > 1) {
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
    if (views.length > 0) await tx.insert(reviewView).values(views);

    // Available to every reviewer at once. Nobody decides who is able to
    // review what: a reviewer who finds it outside their expertise skips
    // it. An organizer can still hold work back or withdraw it, and work
    // already held stays held.
    const assignmentState = ep.assignmentState === "pending" ? "ready" : ep.assignmentState;

    if (only) {
      // The folder stays open: more can be written in its other sessions,
      // and it is still to be submitted as a whole.
      const [open] = await tx
        .update(episode)
        .set({ updatedAt: now, assignmentState, reviewLevel: "general" })
        .where(eq(episode.id, episodeId))
        .returning();
      return { episode: open, already: false as const, sessions: 1 };
    }

    const [submitted] = await tx
      .update(episode)
      .set({
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
        assignmentState,
        reviewLevel: "general",
      })
      .where(eq(episode.id, episodeId))
      .returning();

    return { episode: submitted, already: false as const, sessions: included.length };
  });
}

/**
 * Submits one conversation: by itself if it is a session in a folder,
 * leaving the folder open; as the whole of the work if it stands alone.
 */
export async function submitSession(conversationId: string, userId: string) {
  const [row] = await db
    .select({ episodeId: conversation.episodeId })
    .from(conversation)
    .where(and(eq(conversation.id, conversationId), eq(conversation.userId, userId)));
  if (!row?.episodeId) throw new EpisodeError("That conversation could not be found.");
  return submitEpisode(row.episodeId, userId, conversationId);
}

/**
 * Starts a related version of one submitted conversation: a new, empty
 * conversation in the same family, on the same model. None of the
 * source's messages go with it; the link is the only connection.
 *
 * The link is between the two conversations. The source may be a session
 * in a folder, and the new conversation may later be given more sessions
 * and so become a folder: neither changes what is related to what.
 */
export async function createRelatedVersion(opts: {
  sourceConversationId: string;
  userId: string;
  intent: string;
  intendedDifference: string;
}) {
  const [source] = await db
    .select({
      id: conversation.id,
      status: conversation.status,
      modelId: conversation.modelId,
      episodeId: episode.id,
      familyId: episode.sourceFamilyId,
    })
    .from(conversation)
    .innerJoin(episode, eq(episode.id, conversation.episodeId))
    .where(and(eq(conversation.id, opts.sourceConversationId), eq(conversation.userId, opts.userId)));
  if (!source) throw new EpisodeError("That conversation could not be found.");
  if (source.status !== "submitted") {
    throw new EpisodeError("Submit the original first: a related conversation is made from a submission.");
  }
  const { episode: created, session } = await createEpisode({
    userId: opts.userId,
    modelId: source.modelId,
    related: { sourceEpisodeId: source.episodeId, familyId: source.familyId },
  });
  await db.insert(relatedVersion).values({
    sourceEpisodeId: source.episodeId,
    targetEpisodeId: created.id,
    sourceConversationId: source.id,
    targetConversationId: session.id,
    familyId: source.familyId,
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
      // Made with Create related version: this conversation, not
      // whatever else has since been put in a folder with it.
      related: sql<boolean>`exists (
        select 1 from related_version rv where rv.target_conversation_id = ${conversation.id}
      )`,
    })
    .from(conversation)
    .innerJoin(episode, eq(episode.id, conversation.episodeId))
    .where(eq(conversation.userId, userId))
    .orderBy(desc(episode.createdAt), asc(conversation.sessionOrder));
}

/**
 * Changes what a related version says it set out to explore. Allowed
 * while the related conversation is still a draft: once it is submitted,
 * what it said is part of the record. That it was revised, and when, is
 * kept.
 */
export async function reviseRelatedIntent(opts: {
  targetConversationId: string;
  userId: string;
  intent: string;
  intendedDifference: string;
}) {
  const [target] = await db
    .select({ status: conversation.status })
    .from(conversation)
    .where(
      and(eq(conversation.id, opts.targetConversationId), eq(conversation.userId, opts.userId)),
    );
  if (!target) throw new EpisodeError("That conversation could not be found.");
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
        eq(relatedVersion.targetConversationId, opts.targetConversationId),
        // Unchanged answers are not a revision.
        sql`(${relatedVersion.comparisonIntent}, ${relatedVersion.intendedDifference}) is distinct from (${opts.intent}, ${opts.intendedDifference})`,
      ),
    )
    .returning({ id: relatedVersion.id });
  return { changed: Boolean(revised) };
}

/** The related-version links one conversation takes part in, either way round. */
export async function relatedLinks(conversationId: string) {
  return db
    .select({
      id: relatedVersion.id,
      sourceConversationId: relatedVersion.sourceConversationId,
      targetConversationId: relatedVersion.targetConversationId,
      comparisonIntent: relatedVersion.comparisonIntent,
      intendedDifference: relatedVersion.intendedDifference,
      createdAt: relatedVersion.createdAt,
    })
    .from(relatedVersion)
    .where(
      sql`${relatedVersion.sourceConversationId} = ${conversationId} or ${relatedVersion.targetConversationId} = ${conversationId}`,
    )
    .orderBy(asc(relatedVersion.createdAt));
}
