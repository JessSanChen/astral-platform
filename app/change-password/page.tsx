import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/gate";
import { ChangePasswordForm } from "@/components/change-password-form";
import { SignOutButton } from "@/components/sign-out-button";
import { ORGANIZER_PASSWORD_LENGTH } from "@/lib/credentials";

export const metadata = { title: "Choose a new password" };

/**
 * Where someone is sent when their password has to be replaced before they
 * can do anything else: an organizer set a temporary one, or the one they
 * signed in with would no longer be accepted.
 */
export default async function ChangePasswordPage() {
  const cu = await getCurrentUser();
  if (!cu) redirect("/sign-in");
  if (cu.user.banned) redirect("/paused");
  // Nothing to do here otherwise; the profile page is where a password is
  // changed by choice.
  if (!cu.needsPassword) redirect("/profile");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">
          Choose a new password
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The password you just signed in with has to be replaced before you
          carry on. Either an organizer set it for you, which makes it
          temporary, or it is one that would not be accepted today
          {cu.isAdmin
            ? `: organizer accounts need at least ${ORGANIZER_PASSWORD_LENGTH} characters, because of what they can do.`
            : "."}
        </p>
      </div>

      <ChangePasswordForm
        name={cu.user.name}
        email={cu.user.email}
        organizer={cu.isAdmin}
        required
      />

      <div className="border-t border-border pt-4">
        <SignOutButton />
      </div>
    </main>
  );
}
