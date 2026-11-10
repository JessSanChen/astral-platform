"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setNominationsCloseAt,
  setNominationsLocked,
} from "@/app/admin/actions";
import {
  EVENT_TIME_ZONE_LABEL,
  formatEventDateTime,
  fromEventInputValue,
  toEventInputValue,
} from "@/lib/time";

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
  // The field has no time zone of its own, so it is read and written as
  // event time, whatever zone this laptop or the server is in. It used to be
  // filled in from UTC and read back as local time, which showed 3pm as 8pm
  // and moved the deadline five hours later each time it was saved again.
  const [when, setWhen] = useState(closeAt ? toEventInputValue(closeAt) : "");
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="space-y-2">
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
            onChange={(e) => {
              setWhen(e.target.value);
              setNote(null);
            }}
            className="h-8 w-56"
            aria-label={`Closing time, ${EVENT_TIME_ZONE_LABEL}`}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const instant = when ? fromEventInputValue(when) : null;
                if (when && !instant) {
                  setNote("Enter a full date and time.");
                  return;
                }
                await setNominationsCloseAt(instant?.toISOString() ?? null);
                router.refresh();
              })
            }
          >
            {when ? "Set closing time" : "Clear closing time"}
          </Button>
        </div>
      </div>

      {/* Say what is actually stored, with its zone, so the organizer is
          reading the same thing the participants are shown. */}
      <p className="text-xs text-muted-foreground">
        {closeAt
          ? `Currently set to close at ${formatEventDateTime(closeAt)}. `
          : "No closing time is set. "}
        The field is in {EVENT_TIME_ZONE_LABEL}.
      </p>
      {note && <p className="text-xs text-danger">{note}</p>}
    </div>
  );
}
