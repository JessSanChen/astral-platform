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

export async function setBudget(userId: string, tokens: number | null) {
  await requireAdmin();
  await db
    .update(user)
    .set({ dailyTokenBudget: tokens, updatedAt: new Date() })
    .where(eq(user.id, userId));
  revalidatePath("/admin");
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
 * Until now the only way in was editing ADMIN_EMAILS, redeploying and
 * re-running the seed, which needs a laptop and the production connection
 * string. That is a poor position to be in when someone needs promoting
 * mid-event.
 *
 * You cannot change your own role. The obvious misclick would lock you out
 * of the console you need in order to undo it, and the only way back would
 * be the database.
 *
 * That one rule is also what guarantees there is always an organizer left:
 * the caller is one by definition, and cannot be the target, so demoting
 * anyone else still leaves at least the caller. No separate "last organizer"
 * check is needed, and one would never fire.
 *
 * ADMIN_EMAILS still grants the role at sign-up. A change made here is to
 * this account only: if the email is on that list, a fresh sign-up would
 * grant it again.
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
  const clamped = Math.max(1, Math.min(50, Math.round(size)));
  await db
    .update(eventSettings)
    .set({ reviewBatchSize: clamped, updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
}

export async function setDefaultBudget(tokens: number) {
  await requireAdmin();
  await db
    .update(eventSettings)
    .set({ defaultDailyTokenBudget: Math.max(0, Math.round(tokens)), updatedAt: new Date() })
    .where(eq(eventSettings.id, 1));
  settingsChanged();
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
