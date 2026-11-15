import Link from "next/link";
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
          label="Work submitted"
          value={episodes.submitted}
          hint={`${plural(data.sessions.submitted, "session")} in them · ${plural(episodes.draft, "draft")} not submitted`}
        />
        <Stat
          label="Reviews completed"
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
          label="Waiting to be released"
          value={episodes.pending}
          tone={episodes.pending > 0 ? "warn" : "normal"}
          hint={
            settings.autoReleaseSubmissions
              ? "New submissions are released automatically"
              : "Nobody can review these until you route them"
          }
        />
        <Stat
          label="Passed the instruction check"
          value={data.instructionPassed}
          hint={
            data.policyVersion === 0
              ? "No policy is published yet"
              : `For policy version ${data.policyVersion}`
          }
          tone={data.policyVersion === 0 ? "warn" : "normal"}
        />
        <Stat
          label="Being reviewed now"
          value={data.activeAssignments}
          hint={`${data.skips} skipped · ${data.expiredAssignments} ran out of time`}
        />
        <Stat
          label="Comparisons completed"
          value={data.pairAudits}
          hint={`${plural(episodes.related, "related version")} submitted`}
        />
      </div>

      {episodes.pending > 0 && (
        <p className="rounded-[var(--radius)] border border-border bg-muted px-4 py-2.5 text-sm">
          {episodes.pending === 1
            ? "1 submission is waiting to be released for review. "
            : `${episodes.pending} submissions are waiting to be released for review. `}
          <Link href="/admin/submissions?state=pending" className="text-accent underline">
            Open Submissions
          </Link>
        </p>
      )}
      {data.policyVersion === 0 && (
        <p className="rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">
          No reference policy has been published, so reviewing is closed.{" "}
          <Link href="/admin/policy" className="underline">
            Publish one under Policy
          </Link>
          .
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
              { label: "Entered for a prize", value: data.prizeEntries },
            ].filter((row) => row.value > 0)}
          />
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
