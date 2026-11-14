"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profile, user as userTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/gate";
import {
  profileColumns,
  profileFromForm,
  profileSchema,
} from "@/lib/onboarding-schema";

export type OnboardingState = {
  errors?: Record<string, string>;
  message?: string;
};

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const cu = await getCurrentUser();
  if (!cu) redirect("/sign-in");

  const errors: Record<string, string> = {};
  const now = new Date();

  // --- Profile (only validated if still required or the user is editing) ---
  if (cu.needsProfile) {
    const parsed = profileSchema.safeParse(profileFromForm(formData));

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
    } else {
      const p = parsed.data;
      await db.transaction(async (tx) => {
        await tx
          .insert(profile)
          .values({ userId: cu.user.id, ...profileColumns(p), updatedAt: now })
          .onConflictDoUpdate({
            target: profile.userId,
            set: { ...profileColumns(p), updatedAt: now },
          });
        await tx
          .update(userTable)
          .set({ name: p.name, profileCompletedAt: now, updatedAt: now })
          .where(eq(userTable.id, cu.user.id));
      });
    }
  }

  // --- Terms ---
  if (cu.needsTerms) {
    const accepted = formData.get("acceptTerms") === "on";
    const version = Number(formData.get("termsVersion"));
    if (!accepted) {
      errors.acceptTerms = "You must accept the terms to continue.";
    } else if (!Number.isInteger(version) || version !== cu.latestTermsVersion) {
      errors.acceptTerms = "The terms changed while you were reading. Please reload.";
    } else {
      await db
        .update(userTable)
        .set({ termsVersion: version, termsAcceptedAt: now, updatedAt: now })
        .where(eq(userTable.id, cu.user.id));
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, message: "Please fix the highlighted fields." };
  }

  redirect("/chat");
}
