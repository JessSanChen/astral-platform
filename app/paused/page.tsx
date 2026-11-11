import { SignOutButton } from "@/components/sign-out-button";

export default function PausedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-serif text-3xl font-medium tracking-tight">Account paused</h1>
      <p className="text-muted-foreground">
        An organizer has paused this account. Please find the admin on site to
        get it re-enabled.
      </p>
      <SignOutButton />
    </main>
  );
}
