"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventSettings, termsVersion, user } from "@/db/schema";
import { auth } from "@/lib/auth";
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
  await requireAdmin();
  if (tokens !== null && (!Number.isSafeInteger(tokens) || tokens < 1)) {
    return { message: "Enter a whole number of tokens above zero." };
  }
  await db
    .update(user)
    .set({ dailyTokenBudget: tokens, updatedAt: new Date() })
    .where(eq(user.id, userId));
  revalidatePath("/admin");
  return { message: null };
}

export async function setPaused(userId: string, paused: boolean) {
  await requireAdmin();
  await db
    .update(user)
    .set({ banned: paused, updatedAt: new Date() })
    .where(eq(user.id, userId));
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
  revalidatePath("/admin");
  return {
    message: organizer
      ? "Made an organizer. It takes effect for them within about half a minute."
      : "Organizer rights removed. Takes effect within about half a minute.",
  };
}

export async function setChatPaused(paused: boolean) {
  await requireAdmin();
  await db
    .update(eventSettings)
    .set({ chatPaused: paused, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
}

export async function setNominationsLocked(locked: boolean) {
  await requireAdmin();
  await db
    .update(eventSettings)
    .set({ nominationsLocked: locked, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
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
  await requireAdmin();
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
  settingsChanged();
  return { message: null };
}

export async function setReviewBatchSize(size: number) {
  await requireAdmin();
  if (!Number.isFinite(size)) return;
  const clamped = Math.max(1, Math.min(50, Math.round(size)));
  await db
    .update(eventSettings)
    .set({ reviewBatchSize: clamped, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
}

/**
 * The allowance everyone gets unless given their own.
 *
 * Zero or an unreadable number is refused rather than stored: it would turn
 * every participant away with "you have reached today's limit" within
 * seconds. Stopping chat for the room is a separate, labelled control.
 */
export async function setDefaultBudget(tokens: number) {
  await requireAdmin();
  if (!Number.isSafeInteger(tokens) || tokens < 1) {
    return { message: "Enter a whole number of tokens above zero." };
  }
  await db
    .update(eventSettings)
    .set({ defaultDailyTokenBudget: tokens, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
  return { message: null };
}

export async function setEventCode(code: string) {
  await requireAdmin();
  const trimmed = code.trim();
  if (!trimmed) return;
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
  await requireAdmin();
  // A temporary password is held to the same rules as one chosen at
  // sign-up. It is read out across a room, so it should not also be one of
  // the first things anyone would try.
  const problem = passwordProblem(newPassword);
  if (problem) return { message: problem };
  try {
    // The caller's own headers, so the login system sees the organizer's
    // session rather than a cookie assembled here.
    await auth.api.setUserPassword({
      body: { newPassword, userId },
      headers: await headers(),
    });
    return { message: null };
  } catch (e) {
    return { message: (e as Error).message ?? "Could not set the password." };
  }
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
  await requireAdmin();
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
  await requireAdmin();
  await db
    .update(eventSettings)
    .set({ enabledModels: DEFAULT_MODELS, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
  return { message: null };
}
