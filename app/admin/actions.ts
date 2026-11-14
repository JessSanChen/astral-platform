"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventSettings, session, termsVersion, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getEventSettings } from "@/lib/openrouter";
import { passwordProblem } from "@/lib/credentials";
import { DEFAULT_MODELS } from "@/lib/models";
import { requireAdmin } from "@/lib/gate";
import { CACHE_KEYS, invalidate } from "@/lib/cache";

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

export async function setNominationsLocked(locked: boolean) {
  const { user: me } = await requireAdmin();
  await db
    .update(eventSettings)
    .set({ nominationsLocked: locked, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  await recordAudit({
    action: locked ? "nominations_closed" : "nominations_reopened",
    actor: me,
  });
  settingsChanged();
}

/**
 * Sets, or with null clears, the time nominations close.
 *
 * A time that has already passed is refused. It would close nominations the
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
          "That time has already passed, so nominations would close at once. Nothing was changed. To close them now, use the button.",
      };
    }
  }
  await db
    .update(eventSettings)
    .set({ nominationsCloseAt: iso ? new Date(iso) : null, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  await recordAudit({
    action: "nominations_deadline",
    actor: me,
    detail: iso ? `Now ${new Date(iso).toISOString()}.` : "No closing time.",
  });
  settingsChanged();
  return { message: null };
}

export async function setReviewBatchSize(size: number) {
  const { user: me } = await requireAdmin();
  if (!Number.isFinite(size)) return;
  const clamped = Math.max(1, Math.min(50, Math.round(size)));
  await noteSettingChange(me, "Transcripts per review batch", (s) => s.reviewBatchSize, clamped);
  await db
    .update(eventSettings)
    .set({ reviewBatchSize: clamped, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
}

/**
 * How many different people may review one transcript.
 *
 * Lowering it never removes a review already made. A transcript that has
 * more than the new limit keeps them and is simply offered to nobody else.
 */
export async function setMaxReviewsPerTranscript(limit: number) {
  const { user: me } = await requireAdmin();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    return { message: "Reviews per transcript must be a whole number from 1 to 10." };
  }
  await noteSettingChange(me, "Reviews per transcript", (s) => s.maxReviewsPerTranscript, limit);
  await db
    .update(eventSettings)
    .set({ maxReviewsPerTranscript: limit, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
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
  await recordAudit({ action: "model_list_changed", actor: me });
  await db
    .update(eventSettings)
    .set({ enabledModels: DEFAULT_MODELS, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
  return { message: null };
}
