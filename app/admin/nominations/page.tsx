import { Lock, Unlock } from "lucide-react";
import { requireAdmin } from "@/lib/gate";
import { nominationsByTrack } from "@/lib/admin";
import { NOMINATION_TRACKS, nominationStatus } from "@/lib/nominations";
import { Panel } from "@/components/admin-ui";
import { NominationLock } from "@/components/admin-nomination-lock";
import { formatEventDateTime } from "@/lib/time";

const when = formatEventDateTime;

export default async function AdminNominations() {
  await requireAdmin();
  const [entries, status] = await Promise.all([
    nominationsByTrack(),
    nominationStatus(),
  ]);

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
              ? "Nominations are closed. Participants can still read what they submitted."
              : status.closeAt
                ? `Nominations close automatically at ${when(status.closeAt)}.`
                : "Nominations are open with no closing time set."}
          </p>
        </div>
        <div className="mt-3">
          <NominationLock
            // Rebuilt when the stored time changes, so the field always
            // shows what is saved rather than what was typed last.
            key={status.closeAt?.toISOString() ?? "none"}
            locked={status.closedByOrganizer}
            closeAt={status.closeAt?.toISOString() ?? null}
          />
        </div>
      </div>

      {NOMINATION_TRACKS.map((track) => {
        const forTrack = entries.filter((e) => e.track === track.value);
        return (
          <Panel
            key={track.value}
            title={`${track.label} (${forTrack.length})`}
            description={track.blurb}
          >
            {forTrack.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No entries in this track yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {forTrack.map((entry) => (
                  <li key={entry.id} className="py-3">
                    <p className="text-sm font-medium">{entry.headline}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.name} · {entry.email} · {when(entry.updatedAt)}
                      {entry.submissionCount > 1 &&
                        ` · updated ${entry.submissionCount - 1} time(s)`}
                    </p>
                    <p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-relaxed">
                      {entry.details}
                    </p>
                    {entry.collaborators && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Worked with: {entry.collaborators}
                      </p>
                    )}
                    {entry.slidesUrl && (
                      <a
                        href={entry.slidesUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-accent underline"
                      >
                        Open their slides
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
