"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, GitCompareArrows } from "lucide-react";
import { MAIN_DIFFERENCE, VERDICTS } from "@/lib/review-form";
import { formatEventTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type ReviewWorkItem = {
  id: string;
  purpose: string;
  /** When it was finished, or taken up if it is still in progress. */
  at: string;
  /** The answer given, for a finished one. */
  verdict: string | null;
  mainDifference: string | null;
  revisions: number;
  /** Its place among this person's finished items of the same kind. */
  number: number;
};

const label = (choices: { value: string; label: string }[], value: string | null) =>
  choices.find((c) => c.value === value)?.label ?? null;

/**
 * A reviewer's own work, beside every review page: what is in progress,
 * and what they have finished. Either can be opened. A finished one opens
 * with its answers, which can be changed.
 *
 * Records are numbered, not named: a reviewer is never shown a title or
 * anything else about the author.
 */
export function ReviewSidebar({
  inProgress,
  completed,
}: {
  inProgress: ReviewWorkItem[];
  completed: ReviewWorkItem[];
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="p-3">
        <Link
          href="/review"
          aria-current={pathname === "/review" ? "page" : undefined}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border bg-card px-2 py-2 text-sm font-medium hover:bg-muted",
            pathname === "/review" && "bg-muted",
          )}
        >
          <ClipboardCheck className="h-4 w-4" />
          Review home
        </Link>
      </div>

      <nav aria-label="My reviews" className="relative flex-1 space-y-4 overflow-y-auto px-2 pb-3">
        <section aria-label="In progress" className="space-y-0.5">
          <h2 className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In progress
          </h2>
          {inProgress.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">Nothing in progress.</p>
          )}
          {inProgress.map((item) => (
            <Item
              key={item.id}
              item={item}
              active={pathname === `/review/${item.id}`}
              title={item.purpose === "pair_audit" ? "Comparison" : "Transcript review"}
              note="In progress"
            />
          ))}
        </section>

        <section aria-label="Completed" className="space-y-0.5">
          <h2 className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Completed ({completed.length})
          </h2>
          {completed.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Reviews you finish are listed here. You can open one again to see or change your
              answers.
            </p>
          )}
          {completed.map((item) => {
            const answer =
              item.purpose === "pair_audit"
                ? label(MAIN_DIFFERENCE, item.mainDifference)
                : label(VERDICTS, item.verdict);
            return (
              <Item
                key={item.id}
                item={item}
                active={pathname === `/review/${item.id}`}
                title={`${item.purpose === "pair_audit" ? "Comparison" : "Transcript"} ${item.number}`}
                note={[answer, formatEventTime(item.at), item.revisions > 0 && "changed"]
                  .filter(Boolean)
                  .join(" · ")}
              />
            );
          })}
        </section>
      </nav>
    </aside>
  );
}

function Item({
  item,
  active,
  title,
  note,
}: {
  item: ReviewWorkItem;
  active: boolean;
  title: string;
  note: string;
}) {
  const Icon = item.purpose === "pair_audit" ? GitCompareArrows : ClipboardCheck;
  return (
    <Link
      href={`/review/${item.id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-muted",
        active && "bg-muted font-medium",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </span>
      <span className="block truncate pl-[1.375rem] text-xs font-normal text-muted-foreground">
        {note}
      </span>
    </Link>
  );
}
