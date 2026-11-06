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
