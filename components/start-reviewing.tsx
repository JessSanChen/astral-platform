"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fillBatch } from "@/app/review/actions";

/**
 * Fetches a first batch for a reviewer who has none.
 *
 * The claim is made from here rather than while the page renders, because the
 * sidebar is rendered before the page body: claiming during the render left
 * the list empty until the next navigation, so a reviewer saw "nothing
 * waiting" beside a transcript they were holding.
 */
export function StartReviewing({
  batch,
  batchSize,
}: {
  batch: string[];
  batchSize: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tried, setTried] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (batch.length > 0 || asked.current) return;
    asked.current = true;
    startTransition(async () => {
      await fillBatch();
      setTried(true);
      router.refresh();
    });
  }, [batch.length, router]);

  if (batch.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {pending || !tried
            ? `Finding ${batchSize} transcripts for you...`
            : "Nothing to review yet. Transcripts appear here once other participants submit them, so this fills up as the day goes on."}
        </p>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await fillBatch();
              setTried(true);
              router.refresh();
            })
          }
        >
          {pending ? "Looking..." : "Check again"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="lg" onClick={() => router.push(`/review/${batch[0]}`)}>
        Start reviewing
      </Button>
      <span className="text-sm text-muted-foreground">
        {batch.length} waiting for you
      </span>
    </div>
  );
}
