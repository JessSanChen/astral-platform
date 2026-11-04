"use client";

import { useActionState } from "react";
import ReactMarkdown from "react-markdown";
import { completeOnboarding, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_FAMILIARITY,
  BACKGROUNDS,
  DEGREES,
  PROFILE_ROLES,
  SUBDOMAINS,
  YEARS_EXPERIENCE,
} from "@/lib/labels";

type Props = {
  needsProfile: boolean;
  needsTerms: boolean;
  defaultName: string;
  terms: { version: number; body: string } | null;
};

function Options({ values }: { values: readonly string[] }) {
  return (
    <>
      <option value="">Select...</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </>
  );
}

export function OnboardingForm({ needsProfile, needsTerms, defaultName, terms }: Props) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-10">
      {needsProfile && (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">About you</h2>
            <p className="text-sm text-muted-foreground">
              This is attached to every transcript you submit, so the research team
              knows the expertise behind it. It is never shown to other participants.
            </p>
          </div>

          <Field label="Full name" htmlFor="name" error={e.name}>
            <Input id="name" name="name" defaultValue={defaultName} required />
          </Field>

          <Field
            label="Affiliation"
            htmlFor="affiliation"
            hint="University, company, or independent."
            error={e.affiliation}
          >
            <Input id="affiliation" name="affiliation" required />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Role" htmlFor="role" error={e.role}>
              <Select id="role" name="role" required>
                <Options values={PROFILE_ROLES} />
              </Select>
            </Field>
            <Field label="Highest degree" htmlFor="highestDegree" error={e.highestDegree}>
              <Select id="highestDegree" name="highestDegree" required>
                <Options values={DEGREES} />
              </Select>
            </Field>
            <Field label="Years of experience" htmlFor="yearsExperience" error={e.yearsExperience}>
              <Select id="yearsExperience" name="yearsExperience" required>
                <Options values={YEARS_EXPERIENCE} />
              </Select>
            </Field>
            <Field label="Primary background" htmlFor="primaryBackground" error={e.primaryBackground}>
              <Select id="primaryBackground" name="primaryBackground" required>
                <Options values={BACKGROUNDS} />
              </Select>
            </Field>
          </div>

          <Field
            label="Life-science subdomains"
            hint="Pick any that apply. Leave blank if none."
            error={e.subdomains}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SUBDOMAINS.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="subdomains" value={s} className="h-4 w-4" />
                  {s}
                </label>
              ))}
            </div>
          </Field>

          <Field label="How familiar are you with AI chatbots?" htmlFor="aiFamiliarity" error={e.aiFamiliarity}>
            <Select id="aiFamiliarity" name="aiFamiliarity" required>
              <Options values={AI_FAMILIARITY} />
            </Select>
          </Field>

          <Field
            label="Anything specific about your expertise?"
            htmlFor="expertiseNote"
            hint="Optional. For example: 'I work on bacteriophage therapy' or 'ML engineer, no wet-lab experience'."
            error={e.expertiseNote}
          >
            <Textarea id="expertiseNote" name="expertiseNote" rows={3} />
          </Field>
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
    </form>
  );
}
