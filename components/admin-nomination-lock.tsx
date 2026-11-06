"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setNominationsCloseAt,
  setNominationsLocked,
} from "@/app/admin/actions";

/**
 * Two ways to close nominations, because an organizer may need either: a
 * time set in advance, and a switch for closing early or reopening.
 */
export function NominationLock({
  locked,
  closeAt,
}: {
  locked: boolean;
  closeAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // datetime-local wants local time without a zone, which is also what an
  // organizer reads off the schedule.
  const [when, setWhen] = useState(
    closeAt ? new Date(closeAt).toISOString().slice(0, 16) : "",
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={locked ? "outline" : "danger"}
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setNominationsLocked(!locked);
            router.refresh();
          })
        }
      >
        {locked ? "Reopen nominations" : "Close nominations now"}
      </Button>

      <div className="flex items-center gap-2">
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-8 w-56"
          aria-label="Closing time"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setNominationsCloseAt(when ? new Date(when).toISOString() : null);
              router.refresh();
            })
          }
        >
          {when ? "Set closing time" : "Clear closing time"}
        </Button>
      </div>
    </div>
  );
}
