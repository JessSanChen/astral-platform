"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseWholeNumber } from "@/lib/numbers";
import {
  resetPassword,
  setBudget,
  setChatPaused,
  setOrganizer,
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
 * One participant's row in the table, with the controls for their account.
 *
 * The controls open as a row of their own underneath, across the full width
 * of the table. They used to open inside the last cell, which is as narrow
 * as the word "Manage", so the boxes and buttons were squeezed until the
 * button labels wrapped onto two lines.
 *
 * The cells themselves are rendered on the server and passed in.
 */
export function ParticipantRow({
  children,
  columns,
  userId,
  name,
  paused,
  isOrganizer,
  isSelf,
  budget,
  defaultBudget,
}: {
  /** The cells before the Manage button. */
  children: React.ReactNode;
  /** How many columns the table has, so the controls can span them. */
  columns: number;
  userId: string;
  name: string;
  paused: boolean;
  isOrganizer: boolean;
  isSelf: boolean;
  budget: number | null;
  defaultBudget: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // Blank means "no allowance of their own", which is the default.
  const [newBudget, setNewBudget] = useState(budget ? String(budget) : "");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <>
      <tr className="border-t border-border align-top">
        {children}
        <td className="px-3 py-2 text-right">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close" : "Manage"}
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/40">
          <td colSpan={columns} className="px-3 pb-3 pt-1">
            {controls()}
          </td>
        </tr>
      )}
    </>
  );

  /**
   * The three things an organizer actually needs during the day: give
   * someone more allowance, set them a temporary password because there is
   * no email, and stop an account.
   */
  function controls() {
    return (
    <div
      role="group"
      aria-label={`Manage ${name}`}
      // On a narrow window the table scrolls sideways. The controls are
      // held to the width of what is visible (100cqw is the width of the
      // scrolling box, which the page marks as a container) and stay put
      // while the table moves, so they are never half off the screen.
      className="sticky left-3 w-[calc(100cqw-1.5rem)] space-y-3 rounded-[var(--radius)] border border-border bg-card p-3 text-left"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={newBudget}
          onChange={(e) => setNewBudget(e.target.value)}
          placeholder={`Default: ${defaultBudget.toLocaleString("en-US")}`}
          className="h-8 w-44"
          aria-label="Daily token allowance"
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const blank = newBudget.trim() === "";
              const tokens = blank ? null : parseWholeNumber(newBudget);
              if (!blank && (tokens === null || tokens < 1)) {
                setNote(
                  "Enter a whole number of tokens above zero, or leave it blank for the default. Nothing was changed.",
                );
                return;
              }
              const result = await setBudget(userId, tokens);
              setNote(
                result.message ??
                  (blank ? "Back to the default allowance." : "Allowance updated."),
              );
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

        {/* Your own role is not yours to change, so the control says so
            rather than failing after the click. */}
        <Button
          size="sm"
          variant="outline"
          disabled={pending || isSelf}
          title={isSelf ? "Ask another organizer to change your own role." : undefined}
          onClick={() =>
            start(async () => {
              const result = await setOrganizer(userId, !isOrganizer);
              setNote(result.message);
              router.refresh();
            })
          }
        >
          {isOrganizer ? "Remove organizer" : "Make organizer"}
        </Button>
      </div>
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <p className="text-xs text-muted-foreground">
        Changes to {name.split(" ")[0]}&apos;s account take effect within about
        half a minute.
      </p>
    </div>
    );
  }
}
