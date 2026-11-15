"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getNextAssignment, stillHere } from "@/app/review/actions";
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

/**
 * What happens after a record is finished or skipped: straight on to the
 * next one of the same kind. When there is none, back to the Review page,
 * which says what was recorded and why nothing more is on offer.
 */
export function useNextRecord(purpose: Purpose) {
  const router = useRouter();
  return async (after: "recorded" | "skipped") => {
    const result = await getNextAssignment(purpose);
    // The list beside the page is out of date either way.
    router.refresh();
    if (result.ok && result.assignmentId) return router.push(`/review/${result.assignmentId}`);
    router.push(`/review?${after}=${purpose}`);
  };
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
