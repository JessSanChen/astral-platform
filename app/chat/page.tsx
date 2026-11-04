import { requireOnboarded } from "@/lib/gate";
import { SignOutButton } from "@/components/sign-out-button";

export default async function ChatPage() {
  const { user, isAdmin } = await requireOnboarded();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chat</h1>
        <SignOutButton />
      </div>
      <p className="text-muted-foreground">
        Signed in as {user.email}
        {isAdmin ? " (admin)" : ""}. Profile complete, terms v{user.termsVersion} accepted.
      </p>
      <p className="text-sm text-muted-foreground">Chat interface arrives in phase 3.</p>
    </main>
  );
}
