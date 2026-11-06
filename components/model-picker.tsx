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
  const ref = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === value);

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
        onClick={() => setOpen((o) => !o)}
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
          className="absolute left-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-lg"
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
