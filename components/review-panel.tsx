"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { submitReview, type ReviewState } from "@/app/review/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIDENCE_LABELS,
  REVIEW_ACTORS,
  REVIEW_INTENTS,
} from "@/lib/review-schema";

export type ReviewValues = {
  intent: string | null;
  misusePresent: boolean | null;
  actor: string | null;
  goalText: string | null;
  confidence: number | null;
  notes: string | null;
};

export function ReviewPanel({
  conversationId,
  existing,
  alreadyReviewed,
  submissionCount,
}: {
  conversationId: string;
  existing: ReviewValues;
  alreadyReviewed: boolean;
  submissionCount: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    submitReview,
    {},
  );
  // Once a review lands, the sidebar has to move it from "To review" to
  // "Reviewed". That list is rendered on the server, so ask for it again.
  const announced = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.submissionCount === undefined) return;
    if (announced.current === state.submissionCount) return;
    announced.current = state.submissionCount;
    router.refresh();
  }, [state.submissionCount, router]);
  const [values, setValues] = useState(existing);
  const set = <K extends keyof ReviewValues>(k: K, v: ReviewValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));
  const e = state.errors ?? {};
  const done = alreadyReviewed || state.submissionCount !== undefined;

  return (
    <form action={action} className="flex h-full flex-col">
      <input type="hidden" name="conversationId" value={conversationId} />

      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Your assessment</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Judge only what you can see in the conversation. You are not told who
          wrote it or what they said they were doing, on purpose.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="What kind of conversation does this look like?" htmlFor="intent" error={e.intent}>
          <Select
            id="intent"
            name="intent"
            value={values.intent ?? ""}
            onChange={(ev) => set("intent", ev.target.value || null)}
          >
            <option value="">Select...</option>
            {REVIEW_INTENTS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Is there misuse here?"
          htmlFor="misusePresent"
          hint="Judge the attempt, not whether the model went along with it."
          error={e.misusePresent}
        >
          <Select
            id="misusePresent"
            name="misusePresent"
            value={values.misusePresent === null ? "" : values.misusePresent ? "yes" : "no"}
            onChange={(ev) =>
              set("misusePresent", ev.target.value === "" ? null : ev.target.value === "yes")
            }
          >
            <option value="">Select...</option>
            <option value="yes">Yes, an attempt at misuse</option>
            <option value="no">No</option>
          </Select>
        </Field>

        <Field label="Who does the person appear to be?" htmlFor="actor" error={e.actor}>
          <Select
            id="actor"
            name="actor"
            value={values.actor ?? ""}
            onChange={(ev) => set("actor", ev.target.value || null)}
          >
            <option value="">Select...</option>
            {REVIEW_ACTORS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="What do they appear to be trying to do?"
          htmlFor="goalText"
          error={e.goalText}
        >
          <Textarea
            id="goalText"
            name="goalText"
            rows={3}
            value={values.goalText ?? ""}
            onChange={(ev) => set("goalText", ev.target.value)}
          />
        </Field>

        <Field label="How confident are you?" htmlFor="confidence" error={e.confidence}>
          <Select
            id="confidence"
            name="confidence"
            value={values.confidence ? String(values.confidence) : ""}
            onChange={(ev) =>
              set("confidence", ev.target.value ? Number(ev.target.value) : null)
            }
          >
            <option value="">Select...</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {CONFIDENCE_LABELS[n]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Anything else worth noting?" htmlFor="notes">
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            value={values.notes ?? ""}
            onChange={(ev) => set("notes", ev.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {state.message && <p className="text-xs text-danger">{state.message}</p>}
        {state.submissionCount !== undefined && !state.message && (
          <p className="flex items-center gap-1.5 text-xs text-accent">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Review saved. Thank you.
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? "Saving..."
            : done
              ? "Submit again"
              : "Submit review"}
        </Button>
        {done && submissionCount > 1 && (
          <p className="text-center text-xs text-muted-foreground">
            Submitted {submissionCount} times
          </p>
        )}
      </div>
    </form>
  );
}
