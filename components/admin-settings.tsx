"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  setDefaultBudget,
  setEventCode,
  setReviewSettings,
  adoptBuiltInModelList,
} from "@/app/admin/actions";
import { parseWholeNumber } from "@/lib/numbers";

export function EventSettingsForm({
  eventCode,
  defaultBudget,
  reviewsPerView,
  reviewReservationMinutes,
  comparisonActivityOpen,
}: {
  eventCode: string;
  defaultBudget: number;
  reviewsPerView: number;
  reviewReservationMinutes: number;
  comparisonActivityOpen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(eventCode);
  const [budget, setBudget] = useState(String(defaultBudget));
  const [perView, setPerView] = useState(String(reviewsPerView));
  const [reservation, setReservation] = useState(String(reviewReservationMinutes));
  const [comparisonOpen, setComparisonOpen] = useState(comparisonActivityOpen);
  const [note, setNote] = useState<string | null>(null);

  function save() {
    // Check every field before saving any of them. This one button writes
    // all the settings, so an unreadable allowance must stop the save
    // rather than be stored as zero alongside an event code that was the
    // only thing being changed.
    const tokens = parseWholeNumber(budget);
    const reviews = parseWholeNumber(perView);
    const minutes = parseWholeNumber(reservation);
    if (!code.trim()) return setNote("The event code cannot be empty.");
    if (tokens === null || tokens < 1)
      return setNote(
        "The daily allowance must be a whole number above zero. Nothing was saved.",
      );
    if (reviews === null || reviews < 1 || reviews > 7)
      return setNote(
        "Reviews per view must be a whole number from 1 to 7. Nothing was saved.",
      );
    if (minutes === null || minutes < 5 || minutes > 240)
      return setNote(
        "The reservation must be a whole number of minutes from 5 to 240. Nothing was saved.",
      );

    start(async () => {
      const results = await Promise.all([
        setEventCode(code),
        setDefaultBudget(tokens),
        setReviewSettings({
          reviewsPerView: reviews,
          reviewReservationMinutes: minutes,
          comparisonActivityOpen: comparisonOpen,
        }),
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
        label="Reviews per view"
        htmlFor="perView"
        hint="How many different people each conversation, and each folder read as a whole, should be reviewed by. Three lets two agree. Nobody reviews the same thing twice, and lowering this keeps reviews already made."
      >
        <Input id="perView" value={perView} onChange={(e) => setPerView(e.target.value)} />
      </Field>

      <Field
        label="Minutes a reviewer may hold an item"
        htmlFor="reservation"
        hint="After this long without any sign of them, the item can go to someone else. Their place is kept while the page is open and in use."
      >
        <Input
          id="reservation"
          value={reservation}
          onChange={(e) => setReservation(e.target.value)}
        />
      </Field>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0"
          checked={comparisonOpen}
          onChange={(e) => setComparisonOpen(e.target.checked)}
        />
        <span>
          <span className="font-medium">Related versions are open</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            Whether participants can create a related version of something
            they have submitted. Ones already started can still be finished.
          </span>
        </span>
      </label>

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
