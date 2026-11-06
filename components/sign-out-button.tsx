"use client";

import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        await signOut();
        // A full page load, deliberately, rather than a client navigation.
        // Next keeps rendered pages in memory per route, not per person, so
        // navigating within the app can show the previous account's
        // conversations to whoever signs in next. Reloading throws all of
        // that away.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/";
      }}
    >
      Sign out
    </Button>
  );
}
