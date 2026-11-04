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

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {cu.needsProfile ? "Set up your profile" : "Updated terms"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {cu.needsProfile
              ? "Two minutes, then you can start chatting."
              : "The terms have been updated since you last accepted them."}
          </p>
        </div>
        <SignOutButton />
      </div>
      <OnboardingForm
        needsProfile={cu.needsProfile}
        needsTerms={cu.needsTerms}
        defaultName={cu.user.name}
        terms={terms ? { version: terms.version, body: terms.body } : null}
      />
    </main>
  );
}
