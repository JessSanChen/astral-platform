"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import {
  submitNomination,
  type NominationState,
} from "@/app/nominate/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { formatEventTime } from "@/lib/time";
import { KeepFresh } from "@/components/keep-fresh";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Existing = {
  headline: string;
  details: string;
  slidesUrl: string | null;
  updatedAt: string;
  submissionCount: number;
};

export function NominationForm({
  track,
  label,
  blurb,
  locked,
  closeAt,
  existing,
}: {
  track: string;
  label: string;
  blurb: string;
  locked: boolean;
  closeAt: string | null;
  existing: Existing | null;
}) {
  const [state, action, pending] = useActionState<NominationState, FormData>(
    submitNomination,
    {},
  );
  const [values, setValues] = useState({
    headline: existing?.headline ?? "",
    details: existing?.details ?? "",
    slidesUrl: existing?.slidesUrl ?? "",
  });
  const set = (k: keyof typeof values, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));
  const e = state.errors ?? {};
  // A save turned away because nominations had just closed: show the closed
  // page now, not at the next routine check.
  const router = useRouter();
  useEffect(() => {
    if (state.closed) router.refresh();
  }, [state, router]);
  const submitted = existing !== null || state.submissionCount !== undefined;
  // Typed here but not what the organizers have. Only matters at the moment
  // nominations close with this page open.
  const differs = (typed: string, saved: string | undefined) =>
    typed.trim() !== (saved ?? "").trim() ? typed.trim() : "";
  const unsavedHeadline = differs(values.headline, existing?.headline);
  const unsavedDetails = differs(values.details, existing?.details);
  const unsaved =
    unsavedHeadline || unsavedDetails
      ? { headline: unsavedHeadline, details: unsavedDetails }
      : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/nominate"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All tracks
      </Link>

      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{label}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
      </div>

      {/* Someone can have this page open when nominations close. */}
      <KeepFresh at={closeAt} />

      {locked ? (
        <ClosedEntry
          closeAt={closeAt}
          existing={existing}
          unsaved={unsaved}
        />
      ) : (
      <ActionForm action={action} className="mt-6 space-y-5">
        <input type="hidden" name="track" value={track} />

        <Field
          label="Headline finding"
          htmlFor="headline"
          hint="One sentence. This is what the organizers read first."
          error={e.headline}
        >
          <Input
            id="headline"
            name="headline"
            value={values.headline}
            onChange={(ev) => set("headline", ev.target.value)}
            placeholder="A model that refuses direct requests will answer the same question framed as a protocol review"
          />
        </Field>

        <Field
          label="The finding in detail"
          htmlFor="details"
          hint="What you did, what happened, why it matters, and how widely you tested it. Breadth of testing counts."
          error={e.details}
        >
          <Textarea
            id="details"
            name="details"
            rows={10}
            value={values.details}
            onChange={(ev) => set("details", ev.target.value)}
          />
        </Field>

        <Field
          label="Link to slides (optional)"
          htmlFor="slidesUrl"
          hint="A Google Slides link, or anything else you want to present from."
          error={e.slidesUrl}
        >
          <Input
            id="slidesUrl"
            name="slidesUrl"
            value={values.slidesUrl}
            onChange={(ev) => set("slidesUrl", ev.target.value)}
            placeholder="https://docs.google.com/presentation/..."
          />
        </Field>

        {state.message && <p className="text-sm text-danger">{state.message}</p>}
        {state.submissionCount !== undefined && !state.message && (
          <p className="flex items-center gap-1.5 text-sm text-accent">
            <CheckCircle2 className="h-4 w-4" />
            Saved. You can change this until nominations close.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending
              ? "Saving..."
              : submitted
                ? "Update entry"
                : "Submit nomination"}
          </Button>
          {existing && (
            <span className="text-xs text-muted-foreground">
              Last saved{" "}
              {formatEventTime(existing.updatedAt)}
            </span>
          )}
        </div>
      </ActionForm>
      )}
    </div>
  );
}

/**
 * The entry as it stood when nominations closed, as text, not as a form.
 *
 * Greyed-out boxes still look like something you might be able to type
 * into. Plain text under a notice does not.
 */
function ClosedEntry({
  closeAt,
  existing,
  unsaved,
}: {
  closeAt: string | null;
  existing: Existing | null;
  unsaved: { headline: string; details: string } | null;
}) {
  return (
    <div className="mt-6 space-y-6">
      <div
        role="status"
        className="flex items-start gap-3 rounded-[var(--radius)] border border-foreground/20 bg-muted px-4 py-3.5"
      >
        <Lock className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Nominations are closed</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {existing
              ? "This is your entry as the organizers have it. It can no longer be changed."
              : "No entry was submitted for this track, and one can no longer be made."}
            {closeAt ? ` The closing time was ${formatEventTime(closeAt)}.` : ""}
          </p>
        </div>
      </div>

      {existing && (
        <dl className="space-y-5 rounded-[var(--radius)] border border-border bg-card px-5 py-5">
          <ReadOnly label="Headline finding">{existing.headline}</ReadOnly>
          <ReadOnly label="The finding in detail">{existing.details}</ReadOnly>
          <ReadOnly label="Link to slides">
            {existing.slidesUrl ? (
              <a
                href={existing.slidesUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-accent underline"
              >
                {existing.slidesUrl}
              </a>
            ) : (
              "None given."
            )}
          </ReadOnly>
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Last saved {formatEventTime(existing.updatedAt)}.
          </p>
        </dl>
      )}

      {unsaved && (
        <div className="space-y-2 rounded-[var(--radius)] border border-dashed border-border px-5 py-4">
          <p className="text-sm font-medium">What you were typing was not submitted</p>
          <p className="text-sm text-muted-foreground">
            Nominations closed before it was saved. It is kept here until you
            leave this page, in case you want a copy.
          </p>
          {unsaved.headline && (
            <p className="whitespace-pre-wrap text-sm">{unsaved.headline}</p>
          )}
          {unsaved.details && (
            <p className="whitespace-pre-wrap text-sm">{unsaved.details}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReadOnly({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{children}</dd>
    </div>
  );
}
