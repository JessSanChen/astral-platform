import Link from "next/link";
import { Lock, Unlock } from "lucide-react";
import { requireAdmin } from "@/lib/gate";
import { prizeEntries, prizeEntryStatus } from "@/lib/admin";
import { MAX_PRIZE_ENTRIES, provenanceLabel } from "@/lib/episode-options";
import { ASSIGNMENT_STATES, OUTCOME_LABELS } from "@/lib/review-form";
import { Panel } from "@/components/admin-ui";
import { PrizeEntryLock } from "@/components/admin-prize-lock";
import { formatEventDateTime } from "@/lib/time";

export const metadata = { title: "Prize entries" };

const when = formatEventDateTime;

/** "2 Refer, 1 Pending" over an entry's views. */
function outcomeSummary(outcomes: string[]) {
  const counts = new Map<string, number>();
  for (const o of outcomes) counts.set(o, (counts.get(o) ?? 0) + 1);
  return [...counts.entries()]
    .map(([outcome, n]) => (outcomes.length === 1 ? OUTCOME_LABELS[outcome] : `${n} ${OUTCOME_LABELS[outcome]}`))
    .join(", ");
}

/**
 * The work participants have put forward for a prize: submitted episodes
 * they ticked, up to a few each. Nothing is written for an entry; the work
 * is the entry, and it is read from the participant's page.
 */
export default async function AdminPrizeEntries() {
  await requireAdmin();
  const [groups, status] = await Promise.all([prizeEntries(), prizeEntryStatus()]);
  const total = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="space-y-5 px-5 py-5">
      <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          {status.locked ? (
            <Lock className="h-4 w-4 text-danger" />
          ) : (
            <Unlock className="h-4 w-4 text-muted-foreground" />
          )}
          <p className="text-sm">
            {status.locked
              ? "Prize entries are closed. Nobody can enter work or take an entry back."
              : status.closeAt
                ? `Prize entries close automatically at ${when(status.closeAt)}.`
                : "Prize entries are open with no closing time set."}
          </p>
        </div>
        <div className="mt-3">
          <PrizeEntryLock
            // Rebuilt when the stored time changes, so the field always
            // shows what is saved rather than what was typed last.
            key={status.closeAt?.toISOString() ?? "none"}
            locked={status.closedByOrganizer}
            closeAt={status.closeAt?.toISOString() ?? null}
          />
        </div>
      </div>

      <Panel
        title={`Prize entries (${total})`}
        description={`Submitted work its author has put forward, up to ${MAX_PRIZE_ENTRIES} each. A piece of work and its related versions count as one. Open the participant to read an entry in full.`}
      >
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been entered yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((group) => (
              <li key={group.authorId} className="py-3">
                <p className="text-sm">
                  <Link
                    href={`/admin/participants/${group.authorId}?show=submitted`}
                    className="font-medium text-accent underline"
                  >
                    {group.authorName}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">
                    {group.authorEmail} · {group.entries.length} entr
                    {group.entries.length === 1 ? "y" : "ies"}
                  </span>
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {group.entries.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <span className="font-medium">{entry.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {entry.isFolder ? "Folder" : "Conversation"} ·{" "}
                        {provenanceLabel(entry.taskProvenance)}
                        {entry.creationMethod === "related_live" && " · related version"} ·
                        entered {entry.prizeEntryAt ? when(entry.prizeEntryAt) : ""}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {ASSIGNMENT_STATES.find((s) => s.value === entry.assignmentState)?.label ??
                          entry.assignmentState}{" "}
                        for review · {entry.reviews} review{entry.reviews === 1 ? "" : "s"} so far
                        {entry.outcomes.length > 0 && ` · ${outcomeSummary(entry.outcomes)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
