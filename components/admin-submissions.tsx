"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEpisodeRouting } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

/**
 * Holding a submission back from review, withdrawing it, or putting it
 * back.
 *
 * Every submission is open to every reviewer the moment it is submitted;
 * nobody decides who is able to review what. This is for the case where
 * one should not be shown at all: something confidential was typed, or
 * its author asked for it to be pulled.
 */
export function SubmissionState({
  episodeId,
  assignmentState,
  activeHolders,
}: {
  episodeId: string;
  assignmentState: string;
  /** Reviewers part-way through something of this submission's right now. */
  activeHolders: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const open = assignmentState === "ready";

  function move(to: "ready" | "held" | "withdrawn") {
    setNote(null);
    start(async () => {
      const result = await setEpisodeRouting(episodeId, {
        reviewLevel: "general",
        eligibleDomains: [],
        assignmentState: to,
      });
      if (result.message) return setNote({ text: result.message, bad: true });
      const back = result.takenBack ?? 0;
      setNote({
        text:
          back > 0
            ? `Saved. Taken back from ${back} reviewer${back === 1 ? "" : "s"} who had it open.`
            : "Saved.",
        bad: false,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {open ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => move("held")}>
              Hold back from review
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => move("withdrawn")}>
              Withdraw
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => move("ready")}>
            Make available for review
          </Button>
        )}
        {assignmentState === "held" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => move("withdrawn")}>
            Withdraw
          </Button>
        )}
      </div>
      {open && activeHolders > 0 && (
        <p className="text-xs text-muted-foreground">
          {activeHolders} reviewer{activeHolders === 1 ? " has" : "s have"} this open now. Holding
          or withdrawing takes it back from them; nothing they had typed is recorded.
        </p>
      )}
      {note && (
        <p role="status" className={note.bad ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
