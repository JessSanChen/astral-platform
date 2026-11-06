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
} from "@/app/admin/actions";

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
    start(async () => {
      await Promise.all([
        setEventCode(code),
        setDefaultBudget(Number(budget) || 0),
        setReviewBatchSize(Number(batch) || 5),
      ]);
      setNote("Saved.");
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
