import Link from "next/link";
import { Lock, Trophy } from "lucide-react";
import { KeepFresh } from "@/components/keep-fresh";
import { PrizeEntries } from "@/components/prize-entries";
import { MAX_PRIZE_ENTRIES } from "@/lib/episode-options";
import { requireOnboarded } from "@/lib/gate";
import { listPrizeCandidates, prizeEntryStatus } from "@/lib/prizes";
import { formatEventDateTime } from "@/lib/time";

export const metadata = { title: "Prizes" };

/**
 * Putting submitted work forward for a prize (form N).
 *
 * A mark on the work and nothing more: no write-up, and it changes neither
 * the record nor how it is reviewed. Up to three, where a piece of work and
 * the related versions made from it count once between them.
 */
export default async function PrizesPage() {
  const { user } = await requireOnboarded();
  const [work, status] = await Promise.all([listPrizeCandidates(user.id), prizeEntryStatus()]);
  const used = new Set(work.filter((w) => w.entered).map((w) => w.familyId)).size;
  const entered = work.filter((w) => w.entered);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 font-serif text-3xl font-medium tracking-tight">
          <Trophy className="h-5 w-5" />
          Prizes
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Mark up to {MAX_PRIZE_ENTRIES} pieces of your submitted work for the
          prize panel to consider. There is nothing to write. A piece of work
          and the related versions made from it count as one entry. Entering,
          or not, changes nothing about the record or how it is reviewed.
          Reviewing is considered for its own award without an entry.
        </p>
        {!status.closed && status.closeAt && (
          <p className="text-sm text-muted-foreground">
            Entries close at {formatEventDateTime(status.closeAt)}.
          </p>
        )}
      </div>

      {/* Someone can have this page open when entries close. */}
      <KeepFresh at={status.closeAt?.toISOString() ?? null} />

      {status.closed && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-[var(--radius)] border border-foreground/20 bg-muted px-4 py-3.5"
        >
          <Lock className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Prize entries are closed</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {entered.length > 0
                ? "What you entered is with the organizers and is shown below. It can no longer be changed."
                : "You did not enter anything, and entries can no longer be made."}
              {status.closeAt ? ` The closing time was ${formatEventDateTime(status.closeAt)}.` : ""}
            </p>
          </div>
        </div>
      )}

      {work.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius)] border border-dashed border-border px-5 py-8 text-center">
          <p className="font-medium">Nothing submitted yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Only submitted work can be entered. Submit a conversation or a
            folder from{" "}
            <Link href="/chat" className="text-accent underline-offset-2 hover:underline">
              My chats
            </Link>{" "}
            and it will appear here.
          </p>
        </div>
      ) : (
        <PrizeEntries
          closed={status.closed}
          used={used}
          max={MAX_PRIZE_ENTRIES}
          work={(status.closed ? entered : work).map((w) => ({
            id: w.id,
            title: w.title,
            isFolder: w.isFolder,
            sessions: w.sessions,
            related: w.related,
            entered: w.entered,
            sessionId: w.sessionId,
            submitted: w.submittedAt ? formatEventDateTime(w.submittedAt) : null,
          }))}
        />
      )}
    </div>
  );
}
