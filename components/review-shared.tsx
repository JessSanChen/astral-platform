"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getNextAssignment, stillHere } from "@/app/review/actions";
import { Button } from "@/components/ui/button";
import type { Purpose } from "@/lib/assignments";

/** A form's answers so far, kept in this browser until it is submitted. */
export function readDraft<T extends object>(key: string, empty: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<T>) } : empty;
  } catch {
    return empty;
  }
}
export function writeDraft(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private window may refuse; the form still works, it just is not
    // there after a reload.
  }
}
export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

/**
 * Tells the server, once a minute while the page is in front of someone,
 * that they are still working on this item, so it is not handed on.
 */
export function useStillHere(assignmentId: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void stillHere(assignmentId);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [assignmentId, active]);
}

/** What is shown in place of the form once an item is finished. */
export function ReviewFinished({
  heading,
  detail,
  purpose,
}: {
  heading: string;
  detail: string;
  purpose: Purpose;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4" role="status">
      <div>
        <h2 className="font-serif text-lg font-medium">{heading}</h2>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      {note && <p className="rounded-[var(--radius)] bg-muted px-3 py-2 text-sm">{note}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await getNextAssignment(purpose);
              if (!result.ok) return setNote(result.message);
              if (!result.assignmentId) {
                return setNote(
                  "There is nothing more for you right now. More becomes available as people submit.",
                );
              }
              router.push(`/review/${result.assignmentId}`);
            })
          }
        >
          {pending ? "Finding one..." : "Next item"}
        </Button>
        <Link href="/review">
          <Button variant="outline">Stop for now</Button>
        </Link>
      </div>
    </div>
  );
}

/** One question: its text, an optional note, and the control. */
export function Question({
  id,
  text,
  hint,
  error,
  children,
}: {
  id: string;
  text: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-question={id} className="space-y-2">
      <div>
        <h3 className="text-sm font-medium leading-snug">{text}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/** Tick boxes for a question that takes several answers. */
export function Checks({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={value.includes(option.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, option.value]
                    : value.filter((v) => v !== option.value),
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
