"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  episode,
  eventSettings,
  relatedVersion,
  reviewAssignment,
  reviewPolicy,
  reviewView,
  session,
  termsVersion,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getEventSettings } from "@/lib/openrouter";
import { passwordProblem } from "@/lib/credentials";
import { DEFAULT_MODELS } from "@/lib/models";
import { requireAdmin } from "@/lib/gate";
import { CACHE_KEYS, invalidate } from "@/lib/cache";
import { DOMAIN_IDS } from "@/lib/intake";
import { parseRules } from "@/lib/policy";
import { ASSIGNMENT_STATES, REVIEW_LEVELS } from "@/lib/review-form";

/** Settings are held briefly in memory, so a change must clear that too. */
function settingsChanged() {
  invalidate(CACHE_KEYS.eventSettings);
  revalidatePath("/admin");
}

/**
 * A participant's own daily allowance, or null to go back to the default.
 *
 * Refuses anything that is not a positive whole number. An allowance of zero
 * stops the account from chatting, which is what pausing is for and says so;
 * arriving at it by a mistyped number should not be possible.
 */
export async function setBudget(userId: string, tokens: number | null) {
  const { user: me } = await requireAdmin();
  if (tokens !== null && (!Number.isSafeInteger(tokens) || tokens < 1)) {
    return { message: "Enter a whole number of tokens above zero." };
  }
  await db
    .update(user)
    .set({ dailyTokenBudget: tokens, updatedAt: new Date() })
    .where(eq(user.id, userId));
  await recordAudit({
    action: "allowance_set",
    actor: me,
    target: userId,
    detail: tokens === null ? "Back to the default." : `${tokens.toLocaleString("en-US")} tokens a day.`,
  });
  revalidatePath("/admin");
  return { message: null };
}

export async function setPaused(userId: string, paused: boolean) {
  const { user: me } = await requireAdmin();
  // The same rule as for the role, for the same reason: a slip on your own
  // row would shut you out of the console you would need to undo it.
  if (userId === me.id) {
    return { message: "You cannot pause your own account. Ask another organizer to do it." };
  }
  await db
    .update(user)
    .set({ banned: paused, updatedAt: new Date() })
    .where(eq(user.id, userId));
  await recordAudit({
    action: paused ? "account_paused" : "account_resumed",
    actor: me,
    target: userId,
  });
  revalidatePath("/admin");
  return { message: null };
}

/**
 * Granting or removing the organizer role.
 *
 * This is the only way the role is given once the event is running. The
 * seed script can promote an existing account too, but that needs a laptop
 * and the production connection string, which is the wrong shape of task
 * when someone needs promoting mid-event.
 *
 * You cannot change your own role. The obvious misclick would lock you out
 * of the console you need in order to undo it, and the only way back would
 * be the database.
 *
 * That one rule is also what guarantees there is always an organizer left:
 * the caller is one by definition, and cannot be the target, so demoting
 * anyone else still leaves at least the caller. No separate "last organizer"
 * check is needed, and one would never fire.
 */
export async function setOrganizer(userId: string, organizer: boolean) {
  const current = await requireAdmin();

  if (userId === current.user.id) {
    return {
      message:
        "You cannot change your own role. Ask another organizer to do it.",
    };
  }

  await db
    .update(user)
    .set({ role: organizer ? "admin" : "user", updatedAt: new Date() })
    .where(eq(user.id, userId));
  // A new organizer is signed out, so that they sign in again as one. That
  // is the moment their password is checked against what an organizer's
  // has to be, and replaced if it falls short.
  if (organizer) await db.delete(session).where(eq(session.userId, userId));
  await recordAudit({
    action: organizer ? "organizer_granted" : "organizer_removed",
    actor: current.user,
    target: userId,
  });
  revalidatePath("/admin");
  return {
    message: organizer
      ? "Made an organizer. They are being signed out and will have the console when they sign back in. If their password is shorter than an organizer's has to be, they will be asked for a new one."
      : "Organizer rights removed, as of now.",
  };
}

export async function setChatPaused(paused: boolean) {
  const { user: me } = await requireAdmin();
  await db
    .update(eventSettings)
    .set({ chatPaused: paused, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  await recordAudit({ action: paused ? "chat_paused" : "chat_resumed", actor: me });
  settingsChanged();
}

/** Closes prize entries now, or reopens them. */
export async function setNominationsLocked(locked: boolean) {
  const { user: me } = await requireAdmin();
  await db
    .update(eventSettings)
    .set({ nominationsLocked: locked, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  await recordAudit({
    action: locked ? "prize_entries_closed" : "prize_entries_reopened",
    actor: me,
  });
  settingsChanged();
}

/**
 * Sets, or with null clears, the time prize entries close. (The setting
 * keeps its older name, from when entries were called nominations.)
 *
 * A time that has already passed is refused. It would close entries the
 * moment it was saved, which is never what setting a deadline is for: the
 * usual cause is yesterday's date left in the picker, or 03:00 typed for
 * three in the afternoon. Closing now has its own button.
 */
export async function setNominationsCloseAt(iso: string | null) {
  const { user: me } = await requireAdmin();
  if (iso !== null) {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) {
      return { message: "That is not a date and time. Nothing was changed." };
    }
    if (when.getTime() <= Date.now()) {
      return {
        message:
          "That time has already passed, so prize entries would close at once. Nothing was changed. To close them now, use the button.",
      };
    }
  }
  await db
    .update(eventSettings)
    .set({ nominationsCloseAt: iso ? new Date(iso) : null, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  await recordAudit({
    action: "prize_entries_deadline",
    actor: me,
    detail: iso ? `Now ${new Date(iso).toISOString()}.` : "No closing time.",
  });
  settingsChanged();
  return { message: null };
}

/**
 * How reviewing is run: how many reviews each view is aiming for, how long
 * a reviewer may hold an item, whether new submissions go out for review by
 * themselves, and whether related versions can be made.
 *
 * Lowering the number of reviews never removes one already made. A view
 * that has more than the new target keeps them and is offered to nobody
 * else.
 */
export async function setReviewSettings(input: {
  reviewsPerView: number;
  reviewReservationMinutes: number;
  autoReleaseSubmissions: boolean;
  comparisonActivityOpen: boolean;
}) {
  const { user: me } = await requireAdmin();
  const { reviewsPerView, reviewReservationMinutes } = input;
  if (!Number.isSafeInteger(reviewsPerView) || reviewsPerView < 1 || reviewsPerView > 7) {
    return { message: "Reviews per view must be a whole number from 1 to 7." };
  }
  if (
    !Number.isSafeInteger(reviewReservationMinutes) ||
    reviewReservationMinutes < 5 ||
    reviewReservationMinutes > 240
  ) {
    return { message: "The reservation must be a whole number of minutes from 5 to 240." };
  }
  const autoReleaseSubmissions = input.autoReleaseSubmissions === true;
  const comparisonActivityOpen = input.comparisonActivityOpen === true;

  const before = await getEventSettings();
  const changes: string[] = [];
  const note = (name: string, was: number | boolean, now: number | boolean) => {
    const say = (v: number | boolean) => (typeof v === "boolean" ? (v ? "on" : "off") : String(v));
    if (was !== now) changes.push(`${name}: ${say(was)} to ${say(now)}.`);
  };
  note("Reviews per view", before.reviewsPerView, reviewsPerView);
  note("Review reservation, minutes", before.reviewReservationMinutes, reviewReservationMinutes);
  note("Release new submissions automatically", before.autoReleaseSubmissions, autoReleaseSubmissions);
  note("Related versions open", before.comparisonActivityOpen, comparisonActivityOpen);

  await db
    .update(eventSettings)
    .set({
      reviewsPerView,
      reviewReservationMinutes,
      autoReleaseSubmissions,
      comparisonActivityOpen,
      updatedAt: new Date(),
    })
    .where(eq(eventSettings.id, 1));
  if (changes.length > 0) {
    await recordAudit({ action: "settings_changed", actor: me, detail: changes.join(" ") });
  }
  settingsChanged();
  return { message: null };
}

/**
 * The allowance everyone gets unless given their own.
 *
 * Zero or an unreadable number is refused rather than stored: it would turn
 * every participant away with "you have reached today's limit" within
 * seconds. Stopping chat for the room is a separate, labelled control.
 */
export async function setDefaultBudget(tokens: number) {
  const { user: me } = await requireAdmin();
  if (!Number.isSafeInteger(tokens) || tokens < 1) {
    return { message: "Enter a whole number of tokens above zero." };
  }
  await noteSettingChange(me, "Daily token allowance", (s) => s.defaultDailyTokenBudget, tokens);
  await db
    .update(eventSettings)
    .set({ defaultDailyTokenBudget: tokens, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
  return { message: null };
}

export async function setEventCode(code: string) {
  const { user: me } = await requireAdmin();
  const trimmed = code.trim();
  if (!trimmed) return;
  // That it changed, and by whom. Not what to: the code is a secret.
  if ((await getEventSettings()).eventCode !== trimmed) {
    await recordAudit({ action: "event_code_changed", actor: me });
  }
  await db
    .update(eventSettings)
    .set({ eventCode: trimmed, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
}

/**
 * Sets a temporary password for someone locked out.
 *
 * There is no email on the day, so this is how a forgotten password is
 * handled: an organizer sets something short, reads it out, and the
 * participant signs in with it.
 */
export async function resetPassword(userId: string, newPassword: string) {
  const { user: me } = await requireAdmin();
  if (userId === me.id) {
    return {
      message: "Change your own password from your profile, where it asks for the current one.",
    };
  }
  const [target] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId));
  if (!target) return { message: "That account no longer exists." };

  // A temporary password is held to the same rules as one chosen at
  // sign-up. It is read out across a room, so it should not also be one of
  // the first things anyone would try.
  const problem = passwordProblem(newPassword, {
    name: target.name,
    email: target.email,
    organizer: target.role === "admin",
  });
  if (problem) return { message: problem };
  try {
    // The caller's own headers, so the login system sees the organizer's
    // session rather than a cookie assembled here.
    await auth.api.setUserPassword({
      body: { newPassword, userId },
      headers: await headers(),
    });
  } catch (e) {
    return { message: (e as Error).message ?? "Could not set the password." };
  }

  // Three things follow from "this password was chosen by someone else":
  // the account is signed out wherever it was signed in, so whoever knew
  // the old one is out; any lock from wrong guesses is lifted, since this
  // is how a locked-out person gets back in; and the new password works
  // once, to choose their own.
  await db.delete(session).where(eq(session.userId, userId));
  await db
    .update(user)
    .set({ mustChangePassword: true, failedSignIns: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(user.id, userId));
  await recordAudit({ action: "password_set", actor: me, target });
  return { message: null };
}

/**
 * Ends every session of every account, the caller's included.
 *
 * For when a password may have been guessed and it is not clear whose, or
 * who is still signed in with it. Everyone signs in again, which is when a
 * password that would no longer be accepted gets caught and replaced.
 * Nothing anyone has written is touched.
 */
export async function signEveryoneOut() {
  const { user: me } = await requireAdmin();
  // Recorded first: the session this is running under is about to go.
  await recordAudit({ action: "everyone_signed_out", actor: me });
  await db.delete(session);
  return { message: null };
}

/** Records a change to one of the numbers in the settings, if it changed. */
async function noteSettingChange(
  actor: { id: string; name?: string | null; email?: string | null },
  name: string,
  read: (settings: Awaited<ReturnType<typeof getEventSettings>>) => number,
  next: number,
) {
  const before = read(await getEventSettings());
  if (before === next) return;
  await recordAudit({
    action: "settings_changed",
    actor,
    detail: `${name}: ${before.toLocaleString("en-US")} to ${next.toLocaleString("en-US")}.`,
  });
}

/**
 * Publishes a new version of the terms.
 *
 * A version is never edited once published. People agreed to that exact
 * text, and changing it under them would make their agreement mean
 * something they did not see. A correction is a new version, which asks
 * everyone to accept again on their next page.
 *
 * This is how the placeholder terms get replaced without anyone opening a
 * SQL console.
 */
export async function publishTerms(body: string) {
  const { user: me } = await requireAdmin();
  const text = body.replace(/\r\n/g, "\n").trim();
  if (text.length < 20) {
    return { message: "That is too short to be the terms. Nothing was published." };
  }

  const [latest] = await db
    .select({ version: termsVersion.version, body: termsVersion.body })
    .from(termsVersion)
    .orderBy(sql`${termsVersion.version} desc`)
    .limit(1);
  if (latest && latest.body.trim() === text) {
    return {
      message: `That is the same text as version ${latest.version}. Nothing was published.`,
    };
  }

  try {
    // The next number is worked out in the same statement that inserts it.
    // Two organizers publishing at once cannot both get the same one: the
    // second insert fails on the primary key and is reported, not merged.
    const [published] = await db
      .insert(termsVersion)
      .select(
        db
          .select({
            version: sql<number>`coalesce(max(${termsVersion.version}), 0) + 1`.as("version"),
            body: sql<string>`${text}`.as("body"),
            publishedAt: sql<Date>`now()`.as("published_at"),
          })
          .from(termsVersion),
      )
      .returning({ version: termsVersion.version });

    invalidate(CACHE_KEYS.latestTermsVersion);
    await recordAudit({
      action: "terms_published",
      actor: me,
      detail: `Version ${published.version}.`,
    });
    revalidatePath("/admin");
    return { version: published.version, message: null };
  } catch {
    return {
      message:
        "Another version was published at the same moment. Reload to see it before trying again.",
    };
  }
}

/**
 * Replaces the list of models on offer with the one this version of the app
 * was built with.
 *
 * The live list is a row in the database, so a new version of the app with
 * a newer list in its code changes nothing by itself. This is the way to
 * take the new list without running a command against the database.
 */
export async function adoptBuiltInModelList() {
  const { user: me } = await requireAdmin();
  await db
    .update(eventSettings)
    .set({ enabledModels: DEFAULT_MODELS, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  await recordAudit({ action: "model_list_changed", actor: me });
  settingsChanged();
  return { message: null };
}

/* ---- Submissions: who may review what -------------------------------- */

const LEVELS = REVIEW_LEVELS.map((l) => l.value);
const STATES = ASSIGNMENT_STATES.map((s) => s.value);
/** Levels at which an item can actually be handed to someone. */
const ASSIGNABLE_LEVELS = ["general", "routine", "specialist"];
const DOMAIN_LEVELS = ["routine", "specialist"];
const labelOf = (list: { value: string; label: string }[], value: string | null) =>
  list.find((item) => item.value === value)?.label ?? "Not set";

/**
 * Lets go of whatever reviewers are holding of an episode that may no
 * longer be handed out. What they had already finished stays.
 */
async function expireActiveAssignments(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  episodeIds: string[],
) {
  if (episodeIds.length === 0) return 0;
  const views = tx
    .select({ id: reviewView.id })
    .from(reviewView)
    .where(inArray(reviewView.episodeId, episodeIds));
  const pairs = tx
    .select({ id: relatedVersion.id })
    .from(relatedVersion)
    .where(
      sql`${inArray(relatedVersion.sourceEpisodeId, episodeIds)} or ${inArray(relatedVersion.targetEpisodeId, episodeIds)}`,
    );
  const expired = await tx
    .update(reviewAssignment)
    .set({ state: "expired", finishedAt: new Date() })
    .where(
      and(
        eq(reviewAssignment.state, "active"),
        sql`(${inArray(reviewAssignment.viewId, views)} or ${inArray(reviewAssignment.relatedVersionId, pairs)})`,
      ),
    )
    .returning({ id: reviewAssignment.id });
  return expired.length;
}

/**
 * Says who is able to review a submission, and whether it may be handed
 * out: the organizers' decision, never the author's and never a scanner's.
 *
 * Ready needs a level someone can be matched to. Routine and Specialist
 * need at least one subject, because that is what a reviewer's familiarity
 * is compared with. Moving a record out of Ready takes it back from anyone
 * part-way through it, since a review of it would be refused anyway.
 */
export async function setEpisodeRouting(
  episodeId: string,
  input: { reviewLevel: string | null; eligibleDomains: string[]; assignmentState: string },
) {
  const { user: me } = await requireAdmin();
  const reviewLevel = input.reviewLevel || null;
  const assignmentState = input.assignmentState;
  if (reviewLevel !== null && !LEVELS.includes(reviewLevel)) {
    return { message: "That is not a review level. Nothing was changed." };
  }
  if (!STATES.includes(assignmentState)) {
    return { message: "That is not an assignment state. Nothing was changed." };
  }
  const domains = [...new Set(Array.isArray(input.eligibleDomains) ? input.eligibleDomains : [])];
  if (domains.some((d) => d === "other" || !(DOMAIN_IDS as string[]).includes(d))) {
    return { message: "One of those subjects is not on the list. Nothing was changed." };
  }
  if (reviewLevel && DOMAIN_LEVELS.includes(reviewLevel) && domains.length === 0) {
    return {
      message:
        "Routine and Specialist need at least one subject: reviewers are matched on it. Nothing was changed.",
    };
  }
  if (assignmentState === "ready" && (!reviewLevel || !ASSIGNABLE_LEVELS.includes(reviewLevel))) {
    return {
      message:
        reviewLevel === "unresolved"
          ? "An Unresolved record cannot be Ready: nobody can be matched to it. Choose a level, or leave it Pending or Held."
          : "Choose a review level before making this Ready. Nothing was changed.",
    };
  }

  const result = await db.transaction(async (tx) => {
    const [ep] = await tx.select().from(episode).where(eq(episode.id, episodeId)).for("update");
    if (!ep) return { message: "That submission no longer exists." as string | null, detail: "" };
    if (ep.status !== "submitted") {
      return { message: "Only submitted work can be routed for review.", detail: "" };
    }
    await tx
      .update(episode)
      .set({ reviewLevel, eligibleDomains: domains, assignmentState, updatedAt: new Date() })
      .where(eq(episode.id, episodeId));
    const takenBack = assignmentState === "ready" ? 0 : await expireActiveAssignments(tx, [episodeId]);

    const parts: string[] = [`"${ep.title}".`];
    if (ep.reviewLevel !== reviewLevel) {
      parts.push(`Level: ${labelOf(REVIEW_LEVELS, ep.reviewLevel)} to ${labelOf(REVIEW_LEVELS, reviewLevel)}.`);
    }
    if (ep.assignmentState !== assignmentState) {
      parts.push(
        `State: ${labelOf(ASSIGNMENT_STATES, ep.assignmentState)} to ${labelOf(ASSIGNMENT_STATES, assignmentState)}.`,
      );
    }
    if ([...ep.eligibleDomains].sort().join() !== [...domains].sort().join()) {
      parts.push(`Subjects: ${domains.length ? domains.join(", ") : "none"}.`);
    }
    if (takenBack > 0) parts.push(`Taken back from ${takenBack} reviewer${takenBack === 1 ? "" : "s"}.`);
    return {
      message: null,
      detail: parts.length > 1 ? parts.join(" ") : "",
      author: ep.userId,
      takenBack,
    };
  });
  if (result.message) return { message: result.message };
  if (result.detail) {
    await recordAudit({
      action: "routing_changed",
      actor: me,
      target: result.author,
      detail: result.detail,
    });
  }
  revalidatePath("/admin");
  return { message: null, takenBack: result.takenBack ?? 0 };
}

/**
 * Releases everything still waiting: each Pending submission that has no
 * level yet becomes General and Ready, which any reviewer may be given.
 *
 * Ones an organizer has already given a level to are left alone, as are
 * Held and Withdrawn ones: those were decisions.
 */
export async function releaseAllPending() {
  const { user: me } = await requireAdmin();
  const released = await db
    .update(episode)
    .set({ reviewLevel: "general", assignmentState: "ready", updatedAt: new Date() })
    .where(
      and(
        eq(episode.status, "submitted"),
        eq(episode.assignmentState, "pending"),
        sql`${episode.reviewLevel} is null`,
      ),
    )
    .returning({ id: episode.id });
  if (released.length > 0) {
    await recordAudit({
      action: "submissions_released",
      actor: me,
      detail: `${released.length} pending submission${released.length === 1 ? "" : "s"} released as General.`,
    });
  }
  revalidatePath("/admin");
  return { message: null, released: released.length };
}

/* ---- The reference policy -------------------------------------------- */

/** The text and rules of a policy as typed, or what is wrong with them. */
function readPolicyDraft(body: string, rulesText: string) {
  const text = String(body ?? "").replace(/\r\n/g, "\n").trim();
  if (text.length < 20) return { message: "That is too short to be the policy." };
  if (text.length > 60_000) return { message: "That is too long to publish as one policy." };
  const { rules, problem } = parseRules(String(rulesText ?? ""));
  if (problem) return { message: problem };
  // "No qualifying criterion" only goes with No and "Policy gap" only with
  // Cannot determine, so without a rule of the policy's own that supports
  // Yes, a reviewer answering Yes would have nothing to cite.
  if (!rules.some((r) => r.verdicts.includes("yes"))) {
    return {
      message:
        "Add at least one rule whose answers include yes. Without one, a reviewer who answers Yes has no criterion to cite.",
    };
  }
  return { text, rules };
}

/**
 * Reads a policy as it would be published, without publishing it, so the
 * organizer is shown the rules as the form will offer them before saying
 * yes.
 */
export async function checkPolicyDraft(body: string, rulesText: string) {
  await requireAdmin();
  const draft = readPolicyDraft(body, rulesText);
  if ("message" in draft) return { message: draft.message, rules: null };
  return { message: null, rules: draft.rules };
}

/**
 * Publishes a new version of the policy reviewers apply.
 *
 * Like the terms, a version is never edited: every review records the
 * version it was made under, and that has to go on meaning the same text.
 * A new version sends every reviewer back through the four instruction
 * questions before their next item.
 */
export async function publishPolicy(body: string, rulesText: string) {
  const { user: me } = await requireAdmin();
  const draft = readPolicyDraft(body, rulesText);
  if ("message" in draft) return { message: `${draft.message} Nothing was published.` };
  const { text, rules } = draft;

  const [latest] = await db
    .select()
    .from(reviewPolicy)
    .orderBy(sql`${reviewPolicy.version} desc`)
    .limit(1);
  if (
    latest &&
    latest.body.trim() === text &&
    JSON.stringify(latest.rules) === JSON.stringify(rules)
  ) {
    return {
      message: `That is the same policy as version ${latest.version}. Nothing was published.`,
    };
  }

  try {
    // Numbered in the statement that inserts it, as the terms are: two
    // organizers publishing at once cannot both get the same number.
    const [published] = await db
      .insert(reviewPolicy)
      .select(
        db
          .select({
            version: sql<number>`coalesce(max(${reviewPolicy.version}), 0) + 1`.as("version"),
            body: sql<string>`${text}`.as("body"),
            rules: sql<unknown>`${JSON.stringify(rules)}::jsonb`.as("rules"),
            publishedAt: sql<Date>`now()`.as("published_at"),
          })
          .from(reviewPolicy),
      )
      .returning({ version: reviewPolicy.version });

    invalidate(CACHE_KEYS.reviewPolicy);
    await recordAudit({
      action: "policy_published",
      actor: me,
      detail: `Version ${published.version}, ${rules.length} rule${rules.length === 1 ? "" : "s"}.`,
    });
    revalidatePath("/admin");
    return { version: published.version, message: null };
  } catch {
    return {
      message:
        "Another version was published at the same moment. Reload to see it before trying again.",
    };
  }
}
