"use client";

import { useActionState, useState } from "react";
import ReactMarkdown from "react-markdown";
import { completeOnboarding, type OnboardingState } from "@/app/onboarding/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { IntakeFields, Radios } from "@/components/intake-fields";
import { EMPTY_INTAKE, type IntakeDraft } from "@/lib/intake";
import { TERMS_AGREEMENT } from "@/lib/terms-agreement";

type Props = {
  needsProfile: boolean;
  needsTerms: boolean;
  terms: { version: number; body: string } | null;
};

export function OnboardingForm({ needsProfile, needsTerms, terms }: Props) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );
  const e = state.errors ?? {};
  const [values, setValues] = useState<IntakeDraft>(EMPTY_INTAKE);
  // Held here, like the answers above. A form the server sends back with a
  // complaint is cleared by the browser, and unticking someone's agreement
  // for them because another answer was missing would be a poor reward.
  const [agreed, setAgreed] = useState(false);
  const [publicRelease, setPublicRelease] = useState("");

  return (
    <ActionForm action={formAction} className="space-y-12">
      {needsTerms && terms && (
        <section className="space-y-4">
          <div>
            <h2 className="font-serif text-xl font-medium">Participant Terms and Conditions</h2>
            <p className="text-sm text-muted-foreground">
              Please read before continuing.
            </p>
          </div>
          <div className="markdown max-h-72 overflow-y-auto rounded-[var(--radius)] border border-border bg-card p-4 text-sm leading-relaxed">
            <ReactMarkdown>{terms.body}</ReactMarkdown>
          </div>
          <input type="hidden" name="termsVersion" value={terms.version} />

          {/* One agreement, worded as the terms word it (their section 12):
              agreeing covers taking part and the use of contributions. */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="acceptTerms"
              className="mt-0.5 h-4 w-4"
              checked={agreed}
              onChange={(ev) => setAgreed(ev.target.checked)}
            />
            <span>{TERMS_AGREEMENT}</span>
          </label>
          {e.acceptTerms && <p className="text-xs text-danger">{e.acceptTerms}</p>}

          <div className="space-y-1.5 rounded-[var(--radius)] border border-border bg-card p-4">
            <p className="text-sm">
              May the study release an appropriately reviewed and de-identified
              version of your submitted material publicly? (optional)
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
            <p className="text-xs leading-relaxed text-muted-foreground">
              Choosing No, or leaving this unanswered, does not affect taking
              part or prizes. Nothing is released without separate review, and
              de-identification cannot remove every privacy risk.
            </p>
          </div>
        </section>
      )}

      {needsProfile && (
        <section className="space-y-6">
          <div>
            <h2 className="font-serif text-xl font-medium">About your background</h2>
            <p className="text-sm text-muted-foreground">
              Kept with what you submit, so the research team knows the
              background behind it. It is never shown to other participants,
              and it does not ask for your name, institution or contact
              details again.
            </p>
          </div>

          <IntakeFields
            values={values}
            errors={e}
            onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
          />
        </section>
      )}

      {state.message && <p className="text-sm text-danger">{state.message}</p>}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving..." : "Continue"}
      </Button>
    </ActionForm>
  );
}
