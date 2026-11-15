"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { updateProfile, type ProfileState } from "@/app/profile/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IntakeFields, Radios } from "@/components/intake-fields";
import { type IntakeDraft } from "@/lib/intake";

/**
 * The account's name and the intake answers, editable in place.
 *
 * The same questions and the same checks as on joining, so an answer given
 * then can be corrected later without the two drifting apart. Each save is
 * a new revision of the profile; a review already assigned keeps the
 * familiarity it was assigned on.
 */
export function ProfileForm({
  defaultName,
  intake,
  publicRelease: initialRelease,
}: {
  defaultName: string;
  intake: IntakeDraft;
  publicRelease: string;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    {},
  );
  const [name, setName] = useState(defaultName);
  const [values, setValues] = useState<IntakeDraft>(intake);
  const [publicRelease, setPublicRelease] = useState(initialRelease);
  const e = state.errors ?? {};

  return (
    <ActionForm action={action} className="space-y-10">
      <Field label="Full name" htmlFor="name" error={e.name}>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          required
        />
      </Field>

      <IntakeFields
        values={values}
        errors={e}
        onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
      />

      <section className="space-y-2">
        <h3 className="font-serif text-lg font-medium">Public release</h3>
        <p className="text-sm leading-relaxed">
          May the study release an appropriately reviewed and de-identified
          version of your submitted material publicly?
        </p>
        <Radios
          name="publicRelease"
          legend="Public release"
          value={publicRelease}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          onChange={setPublicRelease}
        />
        <p className="text-xs text-muted-foreground">
          Optional, and yours to change. It does not affect taking part or
          prizes.
        </p>
      </section>

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
