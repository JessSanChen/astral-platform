"use client";

import { useTransition } from "react";

/**
 * A form whose action is called from a transition rather than handed to
 * <form action={...}>.
 *
 * React resets a form's DOM once an action passed that way returns. For a
 * form that can be rejected that is wrong: the answers are still on screen,
 * so a select quietly snaps back to the value the server last rendered while
 * the text fields keep what was typed, and only some of someone's work
 * survives. Calling the action ourselves keeps every field as it was left,
 * which is what matters when one rejected answer sits among nine good ones.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {children}
    </form>
  );
}
