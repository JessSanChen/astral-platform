import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <main className="mx-auto max-w-lg px-6 py-16 space-y-4">
      <h1 className="text-2xl font-semibold">Set up your profile</h1>
      <p className="text-muted-foreground">
        Profile form and terms acceptance arrive in phase 2.
      </p>
    </main>
  );
}
