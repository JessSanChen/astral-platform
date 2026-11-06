"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resetPassword,
  setBudget,
  setChatPaused,
  setPaused,
} from "@/app/admin/actions";

export function PauseChatButton({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={paused ? "default" : "outline"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setChatPaused(!paused);
          router.refresh();
        })
      }
    >
      {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      {pending
        ? "Working..."
        : paused
          ? "Resume chat for everyone"
          : "Pause chat for everyone"}
    </Button>
  );
}

/**
 * The three things an organizer actually needs during the day: give someone
 * more allowance, set them a temporary password because there is no email,
 * and stop an account.
 */
export function ParticipantActions({
  userId,
  paused,
  budget,
  defaultBudget,
}: {
  userId: string;
  paused: boolean;
  budget: number | null;
  defaultBudget: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [newBudget, setNewBudget] = useState(String(budget ?? defaultBudget));
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Manage
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-3 text-left">
      <div className="flex items-center gap-2">
        <Input
          value={newBudget}
          onChange={(e) => setNewBudget(e.target.value)}
          className="h-8 w-32"
          aria-label="Daily token allowance"
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setBudget(userId, Number(newBudget) || 0);
              setNote("Allowance updated.");
              router.refresh();
            })
          }
        >
          Set allowance
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-8 w-44"
          aria-label="Temporary password"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || password.length < 8}
          onClick={() =>
            start(async () => {
              const result = await resetPassword(userId, password);
              setNote(result.message ?? "Password set. Read it out to them.");
              setPassword("");
            })
          }
        >
          Set password
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={paused ? "outline" : "danger"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setPaused(userId, !paused);
              router.refresh();
            })
          }
        >
          {paused ? "Let them back in" : "Pause this account"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <p className="text-xs text-muted-foreground">
        Pausing takes effect within about half a minute.
      </p>
    </div>
  );
}
