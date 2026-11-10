"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import {
  submitNomination,
  type NominationState,
} from "@/app/nominate/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { formatEventTime } from "@/lib/time";
import { CollaboratorPicker } from "@/components/collaborator-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Existing = {
  headline: string;
  details: string;
  slidesUrl: string | null;
  collaborators: string | null;
  updatedAt: string;
  submissionCount: number;
};

export function NominationForm({
  track,
  label,
  blurb,
  locked,
  closeAt,
  participantNames,
  existing,
}: {
  track: string;
  label: string;
  blurb: string;
  locked: boolean;
  closeAt: string | null;
  participantNames: string[];
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
    collaborators: existing?.collaborators ?? "",
  });
  const set = (k: keyof typeof values, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));
  const e = state.errors ?? {};
  const submitted = existing !== null || state.submissionCount !== undefined;

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
        <h1 className="text-2xl font-semibold">{label}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
      </div>

      {locked && (
        <p className="mt-5 flex items-start gap-2 rounded-[var(--radius)] border border-border bg-muted px-3 py-2.5 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Nominations are closed
            {closeAt
              ? ` as of ${formatEventTime(closeAt)}`
              : ""}
            . {existing ? "Your entry is below, as submitted." : "No entry was submitted for this track."}
          </span>
        </p>
      )}

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
            disabled={locked}
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
            disabled={locked}
          />
        </Field>

        {track === "collaborative" && (
          <Field
            label="Who did you work with?"
            htmlFor="collaborators-input"
            hint="Pick from the participant list, or type a name that is not on it. Press Enter to add each one."
            error={e.collaborators}
          >
            <CollaboratorPicker
              name="collaborators"
              value={values.collaborators}
              onChange={(v) => set("collaborators", v)}
              participantNames={participantNames}
              disabled={locked}
            />
          </Field>
        )}

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
            disabled={locked}
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

        {!locked && (
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
        )}
      </ActionForm>
    </div>
  );
}
