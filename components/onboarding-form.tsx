"use client";

import { useActionState, useState } from "react";
import ReactMarkdown from "react-markdown";
import { completeOnboarding, type OnboardingState } from "@/app/onboarding/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import {
  EMPTY_PROFILE,
  ProfileFields,
  type ProfileFieldValues,
} from "@/components/profile-fields";

type Props = {
  needsProfile: boolean;
  needsTerms: boolean;
  defaultName: string;
  terms: { version: number; body: string } | null;
};

export function OnboardingForm({ needsProfile, needsTerms, defaultName, terms }: Props) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );
  const e = state.errors ?? {};
  const [values, setValues] = useState<ProfileFieldValues>({
    ...EMPTY_PROFILE,
    name: defaultName,
  });

  return (
    <ActionForm action={formAction} className="space-y-10">
      {needsProfile && (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">About you</h2>
            <p className="text-sm text-muted-foreground">
              This is attached to every transcript you submit, so the research team
              knows the expertise behind it. It is never shown to other participants.
            </p>
          </div>

          <ProfileFields
            values={values}
            errors={e}
            onChange={(field, value) =>
              setValues((prev) => ({ ...prev, [field]: value }))
            }
          />
        </section>
      )}

      {needsTerms && terms && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Terms and conditions</h2>
            <p className="text-sm text-muted-foreground">Version {terms.version}. Please read before continuing.</p>
          </div>
          <div className="markdown max-h-72 overflow-y-auto rounded-[var(--radius)] border border-border bg-card p-4 text-sm leading-relaxed">
            <ReactMarkdown>{terms.body}</ReactMarkdown>
          </div>
          <input type="hidden" name="termsVersion" value={terms.version} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="acceptTerms" className="mt-0.5 h-4 w-4" />
            <span>I have read and agree to the terms and conditions above.</span>
          </label>
          {e.acceptTerms && <p className="text-xs text-danger">{e.acceptTerms}</p>}
        </section>
      )}

      {state.message && <p className="text-sm text-danger">{state.message}</p>}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving..." : "Continue"}
      </Button>
    </ActionForm>
  );
}
