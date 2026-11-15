"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseAllPending, setEpisodeRouting } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DOMAIN_GROUPS, domainLabel } from "@/lib/intake";
import { ASSIGNMENT_STATES, REVIEW_LEVELS } from "@/lib/review-form";

const LEVEL_OPTIONS = [{ value: "", label: "Not set" }, ...REVIEW_LEVELS];
const NEEDS_SUBJECT = ["routine", "specialist"];
// "Other" is free text on the intake form, so nobody can be matched on it.
const SUBJECT_GROUPS = DOMAIN_GROUPS.map((g) => ({
  group: g.group,
  domains: g.domains.filter((d) => d.id !== "other"),
})).filter((g) => g.domains.length > 0);

/**
 * Who may review one submission: its level, the subjects a reviewer needs
 * for it, and whether it may be handed out. Saved together with one button,
 * because the three only make sense together.
 */
export function SubmissionRouting({
  episodeId,
  reviewLevel,
  eligibleDomains,
  assignmentState,
  activeHolders,
}: {
  episodeId: string;
  reviewLevel: string | null;
  eligibleDomains: string[];
  assignmentState: string;
  /** Reviewers part-way through something of this episode's right now. */
  activeHolders: number;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [level, setLevel] = useState(reviewLevel ?? "");
  const [state, setState] = useState(assignmentState);
  const [domains, setDomains] = useState<string[]>(eligibleDomains);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [subjectsOpen, setSubjectsOpen] = useState(false);

  // When what is stored changes underneath (a bulk release, another
  // organizer), the controls follow it. The note stays, so "Saved." is not
  // wiped by the refresh that the save itself causes.
  const stored = `${reviewLevel}|${assignmentState}|${eligibleDomains.join()}`;
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setLevel(reviewLevel ?? "");
    setState(assignmentState);
    setDomains(eligibleDomains);
  }

  const changed =
    level !== (reviewLevel ?? "") ||
    state !== assignmentState ||
    [...domains].sort().join() !== [...eligibleDomains].sort().join();
  const takingBack = state !== "ready" && assignmentState === "ready" && activeHolders > 0;

  function save(next: { level: string; state: string; domains: string[] }) {
    start(async () => {
      const result = await setEpisodeRouting(episodeId, {
        reviewLevel: next.level || null,
        eligibleDomains: next.domains,
        assignmentState: next.state,
      });
      if (result.message) {
        setNote({ text: result.message, bad: true });
        return;
      }
      setLevel(next.level);
      setState(next.state);
      setDomains(next.domains);
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

  function toggle(domain: string) {
    setNote(null);
    setDomains((list) =>
      list.includes(domain) ? list.filter((d) => d !== domain) : [...list, domain],
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="w-44 space-y-1">
          <label htmlFor={`${id}-level`} className="text-xs font-medium text-muted-foreground">
            Review level
          </label>
          <Select
            id={`${id}-level`}
            value={level}
            onChange={(v) => {
              setLevel(v);
              setNote(null);
            }}
            options={LEVEL_OPTIONS}
          />
        </div>
        <div className="w-36 space-y-1">
          <label htmlFor={`${id}-state`} className="text-xs font-medium text-muted-foreground">
            Assignment state
          </label>
          <Select
            id={`${id}-state`}
            value={state}
            onChange={(v) => {
              setState(v);
              setNote(null);
            }}
            options={ASSIGNMENT_STATES}
          />
        </div>
        <Button
          size="sm"
          disabled={pending || !changed}
          onClick={() => save({ level, state, domains })}
        >
          {pending ? "Saving..." : "Save routing"}
        </Button>
        {assignmentState === "pending" && !reviewLevel && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => save({ level: "general", state: "ready", domains })}
          >
            Release as General
          </Button>
        )}
      </div>

      <details
        className="text-sm"
        open={subjectsOpen || (NEEDS_SUBJECT.includes(level) && domains.length === 0)}
        onToggle={(e) => setSubjectsOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Subjects a reviewer needs ({domains.length})
          {domains.length > 0 && (
            <span className="font-normal">: {domains.map(domainLabel).join(", ")}</span>
          )}
        </summary>
        <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {SUBJECT_GROUPS.map((g) => (
            <fieldset key={g.group} className="space-y-1">
              <legend className="text-xs font-medium text-muted-foreground">{g.group}</legend>
              {g.domains.map((d) => (
                <label key={d.id} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    checked={domains.includes(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                  {d.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </details>

      {NEEDS_SUBJECT.includes(level) && domains.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Routine and Specialist need at least one subject: a reviewer is
          matched on their own rating of it.
        </p>
      )}
      {takingBack && (
        <p className="text-xs text-danger">
          {activeHolders} reviewer{activeHolders === 1 ? " has" : "s have"} this open now. Saving
          takes it back from them; nothing they had typed is recorded.
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

/**
 * Releases every submission still waiting with no level, as General. Two
 * clicks, because it hands the whole backlog to the room at once.
 */
export function ReleaseAllPending({ waiting }: { waiting: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (waiting === 0 && !note) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <span className="text-sm">
            Release {waiting} pending submission{waiting === 1 ? "" : "s"} to any reviewer, as
            General?
          </span>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await releaseAllPending();
                setConfirming(false);
                setNote(
                  result.released === 0
                    ? "Nothing was waiting."
                    : `Released ${result.released} submission${result.released === 1 ? "" : "s"} for review.`,
                );
                router.refresh();
              })
            }
          >
            {pending ? "Releasing..." : `Yes, release ${waiting}`}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            Not yet
          </Button>
        </>
      ) : (
        waiting > 0 && (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Release all pending as General ({waiting})
          </Button>
        )
      )}
      {note && (
        <span role="status" className="text-sm text-muted-foreground">
          {note}
        </span>
      )}
    </div>
  );
}
