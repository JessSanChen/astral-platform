"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signEveryoneOut } from "@/app/admin/actions";

/**
 * Ends every session, the organizer's own included.
 *
 * Asks first, and says what it does and does not do, because the first
 * thing it does is sign out the person pressing it.
 */
export function SignEveryoneOut() {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  if (!asking) {
    return (
      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Everyone, you included, has to sign in again. Nothing anyone has
          written is lost. At sign-in, a password that is too short for an
          organizer, or too easy to guess, has to be replaced before the
          account can be used.
        </p>
        <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
          Sign everyone out
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Sign out every account now, including yours?
      </p>
      <p className="text-sm text-muted-foreground">
        A reply being written at this moment will still be saved. Within half
        a minute, people will find themselves at the sign-in page on their
        next click.
      </p>
      <div className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await signEveryoneOut();
              // A full load: this session no longer exists, and nothing
              // rendered for it should be reused.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/sign-in";
            })
          }
        >
          {pending ? "Signing out..." : "Yes, sign everyone out"}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
