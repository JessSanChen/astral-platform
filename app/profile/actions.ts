"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profile, user as userTable, profileRevision } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireOnboarded } from "@/lib/gate";
import { INTAKE_VERSION, intakeSchema } from "@/lib/intake";

export type ProfileState = {
  errors?: Record<string, string>;
  message?: string;
  savedAt?: string;
};

/**
 * Updating the profile after onboarding.
 *
 * The same schema as onboarding, so the two cannot drift apart. Separate
 * from completeOnboarding because that one also handles the terms and sends
 * people on to the chat; here the person stays where they are.
 */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const { user } = await requireOnboarded();

  const errors: Record<string, string> = {};
  const name = String(formData.get("name") ?? "").trim();
  if (!name) errors.name = "Please enter your name.";
  else if (name.length > 120) errors.name = "Keep your name under 120 characters.";

  let raw: unknown = {};
  try {
    raw = JSON.parse(String(formData.get("intake") ?? "{}"));
  } catch {
    // Left as nothing, which the checks below turn into the usual messages.
  }
  const parsed = intakeSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) {
    return { errors, message: "Please complete the highlighted answers." };
  }

  const release = formData.get("publicRelease");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(profile)
      .set({
        intake: parsed.data,
        intakeVersion: INTAKE_VERSION,
        publicReleasePermission: release === "yes" || release === "no" ? release : null,
        updatedAt: now,
      })
      .where(eq(profile.userId, user.id));
    await tx
      .update(userTable)
      .set({ name, updatedAt: now })
      .where(eq(userTable.id, user.id));
    // The answers as they now stand, added to the history. What was there
    // before stays in the history; the profile row only ever holds the
    // latest.
    await tx.insert(profileRevision).values({
      userId: user.id,
      name,
      intake: parsed.data,
      intakeVersion: INTAKE_VERSION,
      publicReleasePermission: release === "yes" || release === "no" ? release : null,
      source: "profile",
      savedAt: now,
    });
  });

  // The name in the sidebar comes from the session, which is read from a
  // short-lived cookie rather than the database. Without this the old name
  // would sit there for up to half a minute after someone corrected it.
  // Reading the session with the cache off rewrites that cookie, which the
  // nextCookies plugin attaches to this action's response.
  await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });

  // The name is shown on every page, so the change has to reach the rest of
  // the interface, not only this form.
  revalidatePath("/", "layout");
  return { savedAt: now.toISOString() };
}
