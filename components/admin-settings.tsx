"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  setDefaultBudget,
  setEventCode,
  setReviewBatchSize,
  adoptBuiltInModelList,
} from "@/app/admin/actions";
import { parseWholeNumber } from "@/lib/numbers";

export function EventSettingsForm({
  eventCode,
  defaultBudget,
  reviewBatchSize,
}: {
  eventCode: string;
  defaultBudget: number;
  reviewBatchSize: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(eventCode);
  const [budget, setBudget] = useState(String(defaultBudget));
  const [batch, setBatch] = useState(String(reviewBatchSize));
  const [note, setNote] = useState<string | null>(null);

  function save() {
    // Check every field before saving any of them. This one button writes
    // all three settings, so an unreadable allowance must stop the save
    // rather than be stored as zero alongside an event code that was the
    // only thing being changed.
    const tokens = parseWholeNumber(budget);
    const size = parseWholeNumber(batch);
    if (!code.trim()) return setNote("The event code cannot be empty.");
    if (tokens === null || tokens < 1)
      return setNote(
        "The daily allowance must be a whole number above zero. Nothing was saved.",
      );
    if (size === null || size < 1 || size > 50)
      return setNote(
        "The review batch must be a whole number from 1 to 50. Nothing was saved.",
      );

    start(async () => {
      const results = await Promise.all([
        setEventCode(code),
        setDefaultBudget(tokens),
        setReviewBatchSize(size),
      ]);
      const refused = results.find((r) => r && r.message)?.message;
      setNote(refused ?? "Saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Field
        label="Event code"
        htmlFor="eventCode"
        hint="Everyone needs this to create an account. Change it to stop further sign-ups."
      >
        <Input id="eventCode" value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>

      <Field
        label="Daily token allowance per participant"
        htmlFor="budget"
        hint="A guard against a runaway script rather than a ration. Raise an individual's allowance from the participants table."
      >
        <Input id="budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>

      <Field
        label="Transcripts per review batch"
        htmlFor="batch"
        hint="How many a reviewer holds at once. Held for them alone, so nobody labels the same conversation twice."
      >
        <Input id="batch" value={batch} onChange={(e) => setBatch(e.target.value)} />
      </Field>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
        {note && <span className="text-sm text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}

/**
 * Offers the model list this version of the app was built with, when it
 * differs from the one in use.
 *
 * Shown only when there is something to change. Says exactly what would be
 * added and removed, because removing a model has a cost: a conversation
 * already started on it cannot be continued.
 */
export function ModelListUpdate({
  adding,
  removing,
}: {
  adding: string[];
  removing: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (adding.length === 0 && removing.length === 0) return null;

  return (
    <div className="mt-4 space-y-2 rounded-[var(--radius)] border border-border bg-muted/50 px-4 py-3 text-sm">
      <p className="font-medium">This version of the app comes with a different list.</p>
      {adding.length > 0 && (
        <p className="text-muted-foreground">
          <span className="text-foreground">Would add:</span> {adding.join(", ")}.
        </p>
      )}
      {removing.length > 0 && (
        <p className="text-muted-foreground">
          <span className="text-foreground">Would remove:</span> {removing.join(", ")}.
          Conversations already started on these could not be continued, so
          do this before the event, not during it.
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await adoptBuiltInModelList();
            router.refresh();
          })
        }
      >
        {pending ? "Switching..." : "Switch to the new list"}
      </Button>
    </div>
  );
}
