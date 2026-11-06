"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profile, user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireOnboarded } from "@/lib/gate";
import { profileSchema } from "@/lib/onboarding-schema";

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

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    affiliation: formData.get("affiliation"),
    role: formData.get("role"),
    highestDegree: formData.get("highestDegree"),
    yearsExperience: formData.get("yearsExperience"),
    primaryBackground: formData.get("primaryBackground"),
    subdomains: formData.getAll("subdomains"),
    aiFamiliarity: formData.get("aiFamiliarity"),
    expertiseNote: formData.get("expertiseNote") ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { errors, message: "Please fix the highlighted fields." };
  }

  const p = parsed.data;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(profile)
      .set({
        affiliation: p.affiliation,
        role: p.role,
        highestDegree: p.highestDegree,
        yearsExperience: p.yearsExperience,
        primaryBackground: p.primaryBackground,
        subdomains: p.subdomains,
        aiFamiliarity: p.aiFamiliarity,
        expertiseNote: p.expertiseNote || null,
        updatedAt: now,
      })
      .where(eq(profile.userId, user.id));
    await tx
      .update(userTable)
      .set({ name: p.name, updatedAt: now })
      .where(eq(userTable.id, user.id));
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
