"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type Placement = {
  left: number;
  width: number;
  maxHeight: number;
  /** One of these is set: the menu hangs below the field or sits above it. */
  top?: number;
  bottom?: number;
};

const MENU_MAX = 288;
const GAP = 4;

/**
 * A dropdown that looks like the rest of the app.
 *
 * The browser's own <select> opens the operating system's menu, which looks
 * different on every machine and like none of them belongs here. Replacing
 * it means taking on what it did for free, so this follows the standard
 * pattern for a select-only combobox:
 *
 *  - The keyboard works as it does on a native one: arrows, Home and End,
 *    Enter or Space to choose, Escape to back out, and typing to jump to an
 *    option by its first letters.
 *  - A screen reader is told what it is, whether it is open, and which
 *    option is current. A <label htmlFor> names it, as with any field.
 *  - It still posts with its form, through a hidden input carrying `name`.
 *
 * The menu is drawn at the top of the page rather than inside the field's
 * container. Most of these sit in a scrolling side panel, where a menu drawn
 * in place would be cut off at the panel's edge; this way it can also open
 * upwards when there is no room below.
 *
 * An option whose value is "" is how an optional field offers "none": list
 * it first with whatever wording suits ("No particular turn"). Without one,
 * `placeholder` is shown until something is chosen.
 */
export function Select({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Letters typed in quick succession, to jump to an option by name.
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function measure(): Placement | null {
    const el = triggerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - 8;
    const above = rect.top - GAP - 8;
    const wanted = Math.min(MENU_MAX, options.length * 38 + 10);
    const base = { left: rect.left, width: rect.width };
    // Open upwards only when the menu would not fit below and there is more
    // room above.
    if (below < wanted && above > below) {
      return {
        ...base,
        bottom: window.innerHeight - rect.top + GAP,
        maxHeight: Math.min(MENU_MAX, above),
      };
    }
    return {
      ...base,
      top: rect.bottom + GAP,
      maxHeight: Math.max(120, Math.min(MENU_MAX, below)),
    };
  }

  function openMenu(at?: number) {
    if (disabled || options.length === 0) return;
    setPlacement(measure());
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    setOpen(false);
  }

  // While open: close on a click anywhere else, and follow the field if the
  // page scrolls or resizes underneath the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = (e: Event) => {
      // Scrolling the menu itself is not the page moving.
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      setPlacement(measure());
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // measure reads the DOM at call time; it needs no place in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the current option in view when moving through a long list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function typeahead(key: string) {
    const now = Date.now();
    const text = now - typed.current.at > 600 ? key : typed.current.text + key;
    typed.current = { text, at: now };
    const needle = text.toLowerCase();
    const match = options.findIndex((o) => o.label.toLowerCase().startsWith(needle));
    if (match < 0) return;
    if (open) setActive(match);
    else openMenu(match);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const last = options.length - 1;
    const midWord = Date.now() - typed.current.at < 600 && typed.current.text !== "";

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (open) setActive((i) => Math.min(i + 1, last));
        else openMenu();
        return;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActive((i) => Math.max(i - 1, 0));
        else openMenu();
        return;
      case "Home":
        e.preventDefault();
        if (open) setActive(0);
        else openMenu(0);
        return;
      case "End":
        e.preventDefault();
        if (open) setActive(last);
        else openMenu(last);
        return;
      case "Enter":
        e.preventDefault();
        if (open) choose(active);
        else openMenu();
        return;
      case " ":
        e.preventDefault();
        // A space in the middle of typing a name is part of the name.
        if (midWord) typeahead(" ");
        else if (open) choose(active);
        else openMenu();
        return;
      case "Escape":
        if (!open) return;
        // Only this menu closes, not whatever else Escape might dismiss.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        return;
      case "Tab":
        // Moving on with the keyboard takes the highlighted option along,
        // as a native select does.
        if (open) choose(active);
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          typeahead(e.key);
        }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-card px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-50",
          className,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            // Nothing chosen, or the "none" option: shown as a prompt.
            (!selected || selected.value === "") && "text-muted-foreground",
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {name && <input type="hidden" name={name} value={value} />}

      {open &&
        placement &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            // Keep focus on the field while the mouse is used in the menu,
            // so the keyboard still works and blur does not close it first.
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "fixed",
              left: placement.left,
              width: placement.width,
              top: placement.top,
              bottom: placement.bottom,
              maxHeight: placement.maxHeight,
            }}
            className="z-[100] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
          >
            {options.map((option, i) => (
              <div
                key={option.value}
                id={optionId(i)}
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                  i === active && "bg-muted",
                  option.value === "" && "text-muted-foreground",
                )}
              >
                <span className="min-w-0 flex-1">{option.label}</span>
                {option.value === value && (
                  <Check aria-hidden className="h-4 w-4 shrink-0" />
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
