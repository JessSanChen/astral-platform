"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventSettings, user } from "@/db/schema";
import { auth } from "@/lib/auth";
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

export async function setNominationsCloseAt(iso: string | null) {
  await requireAdmin();
  await db
    .update(eventSettings)
    .set({ nominationsCloseAt: iso ? new Date(iso) : null, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
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
  if (newPassword.length < 8) {
    return { message: "Use at least 8 characters." };
  }
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
