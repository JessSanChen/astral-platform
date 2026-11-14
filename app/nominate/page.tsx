import Link from "next/link";
import { CheckCircle2, Circle, Lock, Trophy } from "lucide-react";
import { requireOnboarded } from "@/lib/gate";
import {
  NOMINATION_TRACKS,
  listMyNominations,
  nominationStatus,
} from "@/lib/nominations";
import { formatEventDateTime } from "@/lib/time";
import { KeepFresh } from "@/components/keep-fresh";

const when = formatEventDateTime;

export default async function NominateHome() {
  const { user } = await requireOnboarded();
  const [mine, status] = await Promise.all([
    listMyNominations(user.id),
    nominationStatus(),
  ]);
  const byTrack = new Map(mine.map((n) => [n.track, n]));

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 font-serif text-3xl font-medium tracking-tight">
          <Trophy className="h-5 w-5" />
          Put your work forward
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Two prize tracks are decided by nomination. Tell the organizers what
          you found and why it matters.{" "}
          {status.locked
            ? "Entries were open until nominations closed."
            : "You can enter more than one track, and change an entry until nominations close."}
        </p>
        {!status.locked && status.closeAt && (
          <p className="text-sm text-muted-foreground">
            Nominations close at {when(status.closeAt)}.
          </p>
        )}
      </div>

      {/* Someone can have this page open when nominations close. */}
      <KeepFresh at={status.closeAt?.toISOString() ?? null} />

      {status.locked && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-[var(--radius)] border border-foreground/20 bg-muted px-4 py-3.5"
        >
          <Lock className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Nominations are closed</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mine.length > 0
                ? "Your entries are with the organizers. You can read them below, but they can no longer be changed, and no new ones can be made."
                : "You did not enter a track, and entries can no longer be made."}
              {status.closeAt ? ` The closing time was ${when(status.closeAt)}.` : ""}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {NOMINATION_TRACKS.map((track) => {
          const entry = byTrack.get(track.value);
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium">{track.label}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {track.blurb}
                  </p>
                </div>
                {entry ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Submitted
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <Circle className="h-3.5 w-3.5" />
                    Not entered
                  </span>
                )}
              </div>
              {entry && (
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  &ldquo;{entry.headline}&rdquo; · submitted {when(entry.updatedAt)}
                  {entry.submissionCount > 1
                    ? ` · updated ${entry.submissionCount - 1} time${entry.submissionCount === 2 ? "" : "s"}`
                    : ""}
                  {status.locked ? " · read only" : ""}
                </p>
              )}
            </>
          );

          // Closed with nothing entered: there is nothing behind the card,
          // so it is not a link and does not look like one.
          if (status.locked && !entry) {
            return (
              <div
                key={track.value}
                className="rounded-[var(--radius)] border border-border p-4 opacity-70"
              >
                {body}
              </div>
            );
          }

          return (
            <Link
              key={track.value}
              href={`/nominate/${track.value}`}
              prefetch
              className="block rounded-[var(--radius)] border border-border bg-card p-4 transition-colors hover:bg-muted"
            >
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
