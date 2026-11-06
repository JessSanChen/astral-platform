"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { updateProfile, type ProfileState } from "@/app/profile/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import {
  EMPTY_PROFILE,
  ProfileFields,
  type ProfileFieldValues,
} from "@/components/profile-fields";

/**
 * The profile, editable in place.
 *
 * The same questions and the same validation as onboarding, so an answer
 * given on the way in can be corrected later without the two drifting apart.
 */
export function ProfileForm({
  defaultName,
  details,
}: {
  defaultName: string;
  details: Partial<ProfileFieldValues> | null;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    {},
  );
  const [values, setValues] = useState<ProfileFieldValues>({
    ...EMPTY_PROFILE,
    ...details,
    name: defaultName,
  });

  return (
    <ActionForm action={action} className="space-y-5">
      <h2 className="text-lg font-semibold">About you</h2>

      <ProfileFields
        values={values}
        errors={state.errors ?? {}}
        onChange={(field, value) =>
          setValues((prev) => ({ ...prev, [field]: value }))
        }
      />

      {state.message && <p className="text-sm text-danger">{state.message}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
        {state.savedAt && !state.message && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            Saved.
          </span>
        )}
      </div>
    </ActionForm>
  );
}
