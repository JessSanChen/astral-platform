"use client";

import { useState } from "react";

/** Above this a message is shown cut short, with a way to see the rest. */
const CLAMP_AT = 1500;

/**
 * A message's text, exactly as it was sent or received.
 *
 * Plain text on purpose, not rendered markdown: an organizer checking a
 * transcript should see what was written, not a tidied-up version of it.
 * Long ones start cut short so a page of many transcripts can be scrolled
 * through, and open in place.
 */
export function MessageText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > CLAMP_AT;
  return (
    <>
      <p className="whitespace-pre-wrap break-words">
        {long && !open ? text.slice(0, CLAMP_AT).trimEnd() + "…" : text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 text-xs font-medium text-accent underline"
        >
          {open
            ? "Show less"
            : `Show all ${text.length.toLocaleString("en-US")} characters`}
        </button>
      )}
    </>
  );
}

/** Opens or closes every transcript on the page at once. */
export function ExpandAll() {
  const set = (open: boolean) => {
    for (const el of document.querySelectorAll<HTMLDetailsElement>("details[data-transcript]")) {
      el.open = open;
    }
  };
  return (
    <span className="flex items-center gap-3 text-xs">
      <button type="button" onClick={() => set(true)} className="text-accent underline">
        Open all
      </button>
      <button type="button" onClick={() => set(false)} className="text-accent underline">
        Close all
      </button>
    </span>
  );
}
