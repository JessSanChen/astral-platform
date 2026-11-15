"use client";

import { useState, useTransition } from "react";
import { skipAction } from "@/app/review/actions";
import { Button } from "@/components/ui/button";
import { Radios } from "@/components/intake-fields";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_LIMITS, SKIP_REASONS } from "@/lib/review-form";

/**
 * Skipping (form C-S): a reason, an optional note, and no verdict. It is
 * an answer in its own right, not a failure to give one.
 */
export function ReviewSkip({
  assignmentId,
  onCancel,
  onSkipped,
}: {
  assignmentId: string;
  onCancel: () => void;
  onSkipped: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="font-serif text-lg font-medium">Skip this item</h2>
        <p className="text-sm text-muted-foreground">
          Skipping is never counted against you. You will not be shown this
          record again.
        </p>
      </div>
      <Radios
        name="skip-reason"
        legend="Why are you skipping?"
        value={reason}
        options={SKIP_REASONS}
        onChange={setReason}
      />
      <div className="space-y-1">
        <label htmlFor="skip-note" className="text-sm font-medium">
          Anything to add? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="skip-note"
          value={note}
          maxLength={REVIEW_LIMITS.skipNote}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[60px]"
        />
      </div>
      {message && <p className="text-sm text-danger">{message}</p>}
      <div className="flex gap-2">
        <Button
          disabled={pending || !reason}
          onClick={() =>
            start(async () => {
              const result = await skipAction(assignmentId, { reason, note });
              if (result.ok) return onSkipped();
              setMessage(result.message);
            })
          }
        >
          {pending ? "Skipping..." : "Confirm skip"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          Go back to the form
        </Button>
      </div>
    </div>
  );
}
