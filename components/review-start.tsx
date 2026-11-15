"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitCompareArrows } from "lucide-react";
import { getNextAssignment } from "@/app/review/actions";
import { Button } from "@/components/ui/button";

/**
 * Asking for the next item. One at a time: with one in hand, the only
 * thing on offer is to carry on with it.
 */
export function ReviewStart({
  activeAssignmentId,
  activePurpose,
  reviewed,
  compared,
  skipped,
}: {
  activeAssignmentId: string | null;
  activePurpose: string | null;
  reviewed: number;
  compared: number;
  skipped: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function ask(purpose: "primary" | "pair_audit") {
    setNote(null);
    start(async () => {
      const result = await getNextAssignment(purpose);
      if (!result.ok) return setNote(result.message);
      if (!result.assignmentId) {
        return setNote(
          purpose === "primary"
            ? "There is nothing for you to review right now. Records become available as people submit them and the organizers release them; some need subject knowledge you have not said you have. Try again in a little while."
            : "There is no pair for you to compare right now. Try again in a little while.",
        );
      }
      router.push(`/review/${result.assignmentId}`);
    });
  }

  return (
    <section className="space-y-4 rounded-[var(--radius)] border border-border bg-card px-5 py-5">
      {activeAssignmentId ? (
        <>
          <p className="text-sm">
            You have {activePurpose === "pair_audit" ? "a comparison" : "a review"} in
            progress. It is kept for you, with what you had filled in.
          </p>
          <Link href={`/review/${activeAssignmentId}`}>
            <Button size="lg">Continue where you left off</Button>
          </Link>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={pending} onClick={() => ask("primary")}>
              {pending ? "Finding one..." : reviewed > 0 ? "Next item" : "Get a review"}
            </Button>
            <Button size="lg" variant="outline" disabled={pending} onClick={() => ask("pair_audit")}>
              <GitCompareArrows className="h-4 w-4" />
              Compare two versions
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A review is one record and one form. A comparison shows two
            related versions side by side and asks how well they match; it is
            a separate task, with different information. You can pause either
            and come back.
          </p>
        </>
      )}
      {note && (
        <p role="status" className="rounded-[var(--radius)] bg-muted px-3 py-2 text-sm">
          {note}
        </p>
      )}
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        So far: {reviewed} reviewed, {compared} compared, {skipped} skipped.
        Skipping something outside your expertise is the right thing to do and
        is never counted against you.
      </p>
    </section>
  );
}
