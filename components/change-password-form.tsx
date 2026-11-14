"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import {
  changeOwnPassword,
  type ChangePasswordState,
} from "@/app/change-password/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { passwordRules } from "@/lib/credentials";
import { cn } from "@/lib/utils";

/**
 * The form for replacing your own password, used both where it is required
 * (after a temporary or too-weak one) and on the profile page.
 */
export function ChangePasswordForm({
  name,
  email,
  organizer,
  required = false,
}: {
  name: string;
  email: string;
  organizer: boolean;
  /**
   * True where the change is the one thing the person may do. The server
   * then sends them on to the app once it is done.
   */
  required?: boolean;
}) {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changeOwnPassword,
    {},
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const rules = passwordRules(newPassword, { name, email, organizer });
  const e = state.errors ?? {};

  // Clearing the boxes once the change has gone through. Done in response
  // to the server's answer, which is exactly what an effect is for.
  useEffect(() => {
    if (!state.changedAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPassword("");
    setNewPassword("");
  }, [state.changedAt]);

  return (
    <ActionForm action={action} className="space-y-4">
      {required && <input type="hidden" name="required" value="yes" />}
      <Field label="Current password" htmlFor="currentPassword" error={e.currentPassword}>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(ev) => setCurrentPassword(ev.target.value)}
          aria-invalid={e.currentPassword ? true : undefined}
          aria-describedby={e.currentPassword ? "currentPassword-error" : undefined}
          required
        />
      </Field>

      <Field label="New password" htmlFor="newPassword" error={e.newPassword}>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(ev) => setNewPassword(ev.target.value)}
          aria-invalid={e.newPassword ? true : undefined}
          aria-describedby={e.newPassword ? "newPassword-error" : "new-password-rules"}
          required
        />
        <ul id="new-password-rules" className="space-y-0.5 text-xs">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5",
                rule.met ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Check aria-hidden className={cn("h-3 w-3 shrink-0", !rule.met && "opacity-30")} />
              <span>
                {rule.label}
                <span className="sr-only">{rule.met ? " (met)" : " (not yet met)"}</span>
              </span>
            </li>
          ))}
        </ul>
      </Field>

      {state.message && <p className="text-sm text-danger">{state.message}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Changing..." : "Change password"}
        </Button>
        {state.changedAt && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            Changed. Anywhere else this account was signed in is being signed out.
          </span>
        )}
      </div>
    </ActionForm>
  );
}
