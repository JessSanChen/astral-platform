"use client";

import { useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Picking the people you worked with.
 *
 * Each name becomes a chip rather than a word in a sentence, so it is clear
 * what the form has actually recorded. Typing filters the participant list,
 * but anything can be entered: someone may have worked with a person whose
 * account name is spelled differently, and a nomination should not be held
 * up by that. A name that matches a participant is marked, so a typo in a
 * name the organizers need to match up later is visible while it can still
 * be fixed.
 *
 * The value stays a comma-separated string, which is what the form posts and
 * what the database stores, so nothing downstream has to know about chips.
 */
export function CollaboratorPicker({
  name,
  value,
  onChange,
  participantNames,
  disabled,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  participantNames: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Returning focus to the field after picking a suggestion should not
  // reopen the list we just closed.
  const skipNextFocus = useRef(false);

  const chips = useMemo(
    () => value.split(",").map((s) => s.trim()).filter(Boolean),
    [value],
  );
  const known = useMemo(
    () => new Set(participantNames.map((n) => n.toLowerCase())),
    [participantNames],
  );

  // Only names that match what has been typed and are not already chosen.
  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const taken = new Set(chips.map((c) => c.toLowerCase()));
    return participantNames
      .filter((n) => !taken.has(n.toLowerCase()))
      .filter((n) => (q ? n.toLowerCase().includes(q) : true))
      .slice(0, 6);
  }, [draft, chips, participantNames]);

  const commit = (raw: string) => {
    const clean = raw.trim().replace(/\s+/g, " ");
    if (!clean) return;
    if (chips.some((c) => c.toLowerCase() === clean.toLowerCase())) return;
    onChange([...chips, clean].join(", "));
    setDraft("");
    setActive(0);
    // Close the list once a name is in. Leaving it open hid whatever was
    // underneath, which on the nomination form is the submit button, so a
    // click meant for Submit landed on a suggestion instead. Typing again
    // brings it straight back.
    setOpen(false);
  };

  const remove = (chip: string) =>
    onChange(chips.filter((c) => c !== chip).join(", "));

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      // Enter here adds a name; it must not also submit the nomination.
      e.preventDefault();
      commit(open && matches[active] && draft ? matches[active] : draft);
      return;
    }
    if (e.key === "Backspace" && !draft && chips.length) {
      remove(chips[chips.length - 1]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative">
      {/* The whole box looks and behaves like one field, so clicking the
          empty space beside the chips starts typing. */}
      <div
        onClick={() => !disabled && inputRef.current?.focus()}
        className={cn(
          "flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-[var(--radius)] border border-border bg-card px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-accent/40",
          disabled ? "opacity-60" : "cursor-text",
        )}
      >
        {chips.map((chip) => {
          const verified = known.has(chip.toLowerCase());
          return (
            <span
              key={chip}
              className={cn(
                "inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs",
                verified
                  ? "bg-accent/10 text-accent"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {verified && <Check className="h-3 w-3" aria-hidden />}
              {chip}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(chip)}
                  aria-label={`Remove ${chip}`}
                  className="cursor-pointer rounded-full p-0.5 hover:bg-foreground/10"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}

        <input
          ref={inputRef}
          id={`${name}-input`}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            if (skipNextFocus.current) {
              skipNextFocus.current = false;
              return;
            }
            setOpen(true);
          }}
          // A click on a suggestion would otherwise be lost to the blur.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${name}-suggestions`}
          aria-autocomplete="list"
          placeholder={chips.length ? "" : "Start typing a name"}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 focus-visible:outline-none"
        />
      </div>

      {/* What the form posts: unchanged by any of the above. */}
      <input type="hidden" name={name} value={value} />

      {open && !disabled && (matches.length > 0 || draft.trim()) && (
        <ul
          id={`${name}-suggestions`}
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-[var(--radius)] border border-border bg-card p-1 shadow-lg"
        >
          {matches.map((n, i) => (
            <li key={n}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  skipNextFocus.current = true;
                  commit(n);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                  i === active && "bg-muted",
                )}
              >
                <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
                {n}
              </button>
            </li>
          ))}
          {/* Offered only when nothing on the list matches, so a half-typed
              name does not sit next to the person it is going to find. */}
          {draft.trim() && matches.length === 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    skipNextFocus.current = true;
                    commit(draft);
                    inputRef.current?.focus();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                >
                  Add “{draft.trim()}” — not on the participant list
                </button>
              </li>
          )}
        </ul>
      )}
    </div>
  );
}
