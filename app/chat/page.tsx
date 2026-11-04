import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SignOutButton } from "@/components/sign-out-button";

export default async function ChatPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [u] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id));

  // Onboarding gate: profile + terms must be complete.
  if (!u?.profileCompletedAt || !u?.termsAcceptedAt) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chat</h1>
        <SignOutButton />
      </div>
      <p className="text-muted-foreground">
        Signed in as {session.user.email}
        {u?.role === "admin" ? " (admin)" : ""}.
      </p>
      <p className="text-sm text-muted-foreground">
        Chat interface arrives in phase 3.
      </p>
    </main>
  );
}
