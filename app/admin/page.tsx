import { trackLabel } from "@/lib/nominations";
import { requireAdmin } from "@/lib/gate";
import { overview } from "@/lib/admin";
import { getEventSettings } from "@/lib/openrouter";
import { Bars, Panel, Stat } from "@/components/admin-ui";
import { PauseChatButton } from "@/components/admin-controls";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function AdminOverview() {
  await requireAdmin();
  const [data, settings] = await Promise.all([overview(), getEventSettings()]);
  const { episodes } = data;

  return (
    <div className="space-y-5 px-5 py-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Participants"
          value={data.participants}
          hint={`${data.intakeCompleted} finished the intake form`}
        />
        <Stat
          label="Conversations and folders submitted"
          value={episodes.submitted}
          hint={`${plural(episodes.submitted - episodes.folders, "conversation")} and ${plural(episodes.folders, "folder")}. A folder counts once and holds several sessions: ${plural(data.sessions.submitted, "session")} submitted in all · ${plural(episodes.draft, "draft")} not submitted`}
        />
        <Stat
          label="Transcript reviews completed"
          value={data.reviews}
          hint={`${data.views.full} of ${plural(data.views.total, "view")} have all ${data.reviewsPerView}, ${data.views.started} at least one`}
        />
        <Stat
          label="Spend today"
          value={`$${data.spend.cost.toFixed(2)}`}
          hint={`${data.spend.tokens.toLocaleString()} tokens`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Passed the instruction check"
          value={data.instructionPassed}
          hint={`For review instructions version ${data.policyVersion}`}
        />
        <Stat
          label="In progress now"
          value={data.activeAssignments}
          hint={`${plural(data.activeAssignments - data.activeAudits, "transcript review")}, ${plural(data.activeAudits, "comparison")} · skipped: ${plural(data.skips - data.auditSkips, "transcript")}, ${plural(data.auditSkips, "comparison")} · ${data.expiredAssignments} ran out of time`}
        />
        <Stat
          label="Comparisons completed"
          value={data.pairAudits}
          hint={`${plural(episodes.related, "related version")} submitted`}
        />
      </div>

      {data.testers > 0 && (
        <p className="text-xs text-muted-foreground">
          These numbers leave out {plural(data.testers, "tester account")} and their work. Testers
          are marked on the Participants page.
        </p>
      )}

      {settings.chatPaused && (
        <p className="rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">
          Chat is paused for everyone. Nobody can send a message until you
          resume it.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Submitted work, by review state"
          description="Only Ready work is handed to reviewers."
        >
          <Bars
            rows={[
              { label: "Pending", value: episodes.pending },
              { label: "Ready", value: episodes.ready },
              { label: "Held", value: episodes.held },
              { label: "Withdrawn", value: episodes.withdrawn },
            ].filter((row) => row.value > 0)}
          />
        </Panel>

        <Panel
          title="What was submitted"
          description="As the authors described it when they started."
        >
          <Bars
            rows={[
              { label: "Based on a real task", value: episodes.real },
              { label: "Created for this exercise", value: episodes.invented },
              { label: "Folders (several sessions)", value: episodes.folders },
              { label: "Related versions", value: episodes.related },
            ].filter((row) => row.value > 0)}
          />
        </Panel>

        <Panel title="Nominations" description="Entries received, by track.">
          {data.nominations.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <Bars
              rows={data.nominations.map((row) => ({
                label: trackLabel(row.track),
                value: Number(row.n),
              }))}
            />
          )}
        </Panel>

        <Panel title="Running the day">
          <div className="space-y-3">
            <PauseChatButton paused={settings.chatPaused} />
            {/* Not instant, and better said than discovered: each server
                keeps the settings for a few seconds before reading them
                again. */}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {settings.chatPaused
                ? "Chat is paused. New messages are being turned away; resuming takes up to ten seconds to reach everyone."
                : "Stops new messages for everyone within about ten seconds. Replies already under way are allowed to finish."}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Participants each get a daily allowance of{" "}
              {settings.defaultDailyTokenBudget.toLocaleString()} tokens. Each
              view aims for {plural(settings.reviewsPerView, "review")}, and a
              reviewer may hold an item for {settings.reviewReservationMinutes}{" "}
              minutes.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
