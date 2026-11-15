"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAMILY_LABELS, type ModelFamily, type ModelOption } from "@/lib/models";

const FAMILY_ORDER: ModelFamily[] = ["anthropic", "openai", "open"];

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  className,
}: {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Where the list goes and how tall it may be, worked out each time it is
  // opened from the room there actually is. With ten models the list is
  // taller than the space under the button on a laptop, and it used to run
  // off the bottom of the screen with no way to reach the rest.
  const [placement, setPlacement] = useState({ up: false, right: false, maxHeight: 384 });
  const ref = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === value);

  function toggle() {
    if (!open && ref.current) {
      const box = ref.current.getBoundingClientRect();
      const below = window.innerHeight - box.bottom - 16;
      const above = box.top - 16;
      const up = below < 280 && above > below;
      // The list is 20rem wide. Near the right edge of the window it hangs
      // from the button's right side, so that it is not cut off.
      const right = box.left + 320 > window.innerWidth - 8;
      setPlacement({ up, right, maxHeight: Math.max(160, Math.min(480, up ? above : below)) });
    }
    setOpen((o) => !o);
  }

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grouped = FAMILY_ORDER.map((family) => ({
    family,
    items: models
      .filter((m) => m.family === family)
      .sort((a, b) => a.sort - b.sort),
  })).filter((g) => g.items.length > 0);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 text-sm font-medium transition-colors",
          disabled
            ? "cursor-default text-muted-foreground"
            : "hover:bg-muted",
        )}
      >
        <span className="whitespace-nowrap">
          {selected?.displayName ?? "Choose a model"}
        </span>
        {!disabled && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div
          role="listbox"
          style={{ maxHeight: placement.maxHeight }}
          className={cn(
            "absolute z-50 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1.5 shadow-lg",
            placement.right ? "right-0" : "left-0",
            placement.up ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {grouped.map((group) => (
            <div key={group.family} className="py-1">
              <p className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {FAMILY_LABELS[group.family]}
              </p>
              {group.items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={m.id === value}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
                >
                  <span className="flex-1">
                    <span className="block text-sm">{m.displayName}</span>
                    {m.note && (
                      <span className="block text-xs text-muted-foreground">
                        {m.note}
                      </span>
                    )}
                  </span>
                  {m.id === value && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
