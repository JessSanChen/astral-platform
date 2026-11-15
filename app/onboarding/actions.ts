"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profile, user as userTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/gate";
import { INTAKE_VERSION, intakeSchema } from "@/lib/intake";

export type OnboardingState = {
  errors?: Record<string, string>;
  message?: string;
};

/** The intake answers arrive as one JSON value (see IntakeFields). */
function readIntake(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("intake") ?? "{}"));
  } catch {
    return {};
  }
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const cu = await getCurrentUser();
  if (!cu) redirect("/sign-in");

  const errors: Record<string, string> = {};
  const now = new Date();

  // Everything is checked before anything is written, so a form sent back
  // for one missing answer has not half-saved the rest.
  const parsed = cu.needsProfile ? intakeSchema.safeParse(readIntake(formData)) : null;
  if (parsed && !parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
  }

  // --- Study information and the two agreements (A01) ---
  const version = Number(formData.get("termsVersion"));
  const release = formData.get("publicRelease");
  if (cu.needsTerms) {
    if (formData.get("acceptTerms") !== "on") {
      errors.acceptTerms = "You need to agree to take part in order to continue.";
    } else if (!Number.isInteger(version) || version !== cu.latestTermsVersion) {
      errors.acceptTerms = "The study information changed while you were reading. Please reload.";
    }
    if (formData.get("researchUse") !== "on") {
      errors.researchUse =
        "This agreement is needed to contribute to the research. Without it there is nothing here to do.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, message: "Please complete the highlighted answers." };
  }

  await db.transaction(async (tx) => {
    const consent = cu.needsTerms
      ? {
          participationAgreedAt: now,
          researchUseAgreedAt: now,
          // Unanswered stays null, which nothing treats as permission.
          publicReleasePermission: release === "yes" || release === "no" ? release : null,
        }
      : {};
    const answers = parsed?.success
      ? { intake: parsed.data, intakeVersion: INTAKE_VERSION }
      : {};

    await tx
      .insert(profile)
      .values({ userId: cu.user.id, ...answers, ...consent, updatedAt: now })
      .onConflictDoUpdate({
        target: profile.userId,
        set: { ...answers, ...consent, updatedAt: now },
      });
    await tx
      .update(userTable)
      .set({
        ...(parsed?.success ? { profileCompletedAt: now } : {}),
        ...(cu.needsTerms ? { termsVersion: version, termsAcceptedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(userTable.id, cu.user.id));
  });

  redirect("/chat");
}
