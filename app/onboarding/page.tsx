import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { termsVersion } from "@/db/schema";
import { getCurrentUser } from "@/lib/gate";
import { OnboardingForm } from "@/components/onboarding-form";
import { SignOutButton } from "@/components/sign-out-button";

export default async function OnboardingPage() {
  const cu = await getCurrentUser();
  if (!cu) redirect("/sign-in");
  if (!cu.needsProfile && !cu.needsTerms) redirect("/chat");

  const [terms] = await db
    .select()
    .from(termsVersion)
    .orderBy(desc(termsVersion.version))
    .limit(1);

  // Three ways to land here, and they are not the same message. Someone
  // who forgot the checkbox has never accepted anything, so telling them
  // the terms "have been updated" is simply wrong.
  const heading = cu.needsProfile
    ? {
        title: "Before you start",
        note: "The study information, then a few questions about your background. About three minutes.",
      }
    : cu.user.termsAcceptedAt
      ? {
          title: "Updated study information",
          note: "The study information has been updated since you last agreed to it.",
        }
      : {
          title: "One more thing",
          note: "Your answers are saved. Read and agree to the study information to start.",
        };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-serif text-3xl font-medium tracking-tight">{heading.title}</h1>
          <p className="text-sm text-muted-foreground">{heading.note}</p>
        </div>
        <SignOutButton />
      </div>
      <OnboardingForm
        needsProfile={cu.needsProfile}
        needsTerms={cu.needsTerms}
        terms={terms ? { version: terms.version, body: terms.body } : null}
      />
    </main>
  );
}
