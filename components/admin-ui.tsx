import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "normal" | "warn";
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warn" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function Bars({
  rows,
}: {
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-44 shrink-0 truncate text-sm">{row.label}</span>
          <span className="h-5 flex-1 overflow-hidden rounded bg-muted">
            <span
              className="block h-full rounded bg-accent/70"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-sm tabular-nums">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
