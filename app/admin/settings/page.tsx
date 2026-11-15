import { requireAdmin } from "@/lib/gate";
import { getEventSettings } from "@/lib/openrouter";
import { Panel } from "@/components/admin-ui";
import { EventSettingsForm, ModelListUpdate } from "@/components/admin-settings";
import { DEFAULT_MODELS } from "@/lib/models";
import { BUILD_COMMIT } from "@/lib/build";

export default async function AdminSettings() {
  await requireAdmin();
  const settings = await getEventSettings();
  const liveIds = new Set(settings.enabledModels.map((m) => m.id));
  const builtInIds = new Set(DEFAULT_MODELS.map((m) => m.id));

  return (
    <div className="max-w-2xl space-y-5 px-5 py-5">
      <Panel
        title="Event settings"
        description="Changes take effect within a few seconds."
      >
        <EventSettingsForm
          eventCode={settings.eventCode}
          defaultBudget={settings.defaultDailyTokenBudget}
          reviewsPerView={settings.reviewsPerView}
          reviewReservationMinutes={settings.reviewReservationMinutes}
          comparisonActivityOpen={settings.comparisonActivityOpen}
        />
      </Panel>

      <Panel
        title="Models participants can choose"
        description="Check them against the provider before the event with: npm run prod:check-models"
      >
        <ul className="space-y-1 text-sm">
          {settings.enabledModels.map((model) => (
            <li key={model.id} className="flex items-baseline gap-2">
              <span className="font-medium">{model.displayName}</span>
              <span className="text-xs text-muted-foreground">{model.id}</span>
            </li>
          ))}
        </ul>
        <ModelListUpdate
          adding={DEFAULT_MODELS.filter((m) => !liveIds.has(m.id)).map((m) => m.displayName)}
          removing={settings.enabledModels
            .filter((m) => !builtInIds.has(m.id))
            .map((m) => m.displayName)}
        />
      </Panel>

      <Panel title="Exporting the data">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Everything lives in Postgres and nothing is deleted, so the export
          can wait until the end of the day. One line of JSON per record, and
          every line says what it is in its{" "}
          <code className="rounded bg-muted px-1 text-xs">record</code> field.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <code className="rounded bg-muted px-1 text-xs">participant_intake</code>: each
            person&apos;s intake answers and agreements.
          </li>
          <li>
            <code className="rounded bg-muted px-1 text-xs">episode</code> and{" "}
            <code className="rounded bg-muted px-1 text-xs">episode_goal_revision</code>: each
            conversation or folder, with what its author said about it.
          </li>
          <li>
            <code className="rounded bg-muted px-1 text-xs">session</code>: one conversation
            inside an episode, with every message and the raw request and
            response from the provider. Drafts are included, marked{" "}
            <code className="rounded bg-muted px-1 text-xs">&quot;status&quot;: &quot;draft&quot;</code>.
          </li>
          <li>
            <code className="rounded bg-muted px-1 text-xs">related_version</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">review_view</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">review_assignment</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">review_response</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">pair_audit</code> and{" "}
            <code className="rounded bg-muted px-1 text-xs">review_policy</code>: exactly
            what reviewers were shown, who was given what (skips and expiries
            included), and what they answered under which policy version.
          </li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The last line of a complete file is{" "}
          <code className="rounded bg-muted px-1 text-xs">
            &quot;record&quot;: &quot;end&quot;
          </code>
          , with the number of records of each kind it should contain. A file
          without that line was cut short on the way: download it again.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <a href="/api/admin/export" className="text-sm text-accent underline">
            Download everything as JSONL
          </a>
          <a
            href="/api/admin/export?only=submitted"
            className="text-sm text-accent underline"
          >
            Submitted work only
          </a>
        </div>
      </Panel>

      <Panel title="This deployment">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Running commit{" "}
          <code className="rounded bg-muted px-1 text-xs">{BUILD_COMMIT}</code>.
          Compare it with the latest commit on GitHub to see whether a change
          has reached the site yet. A change that fails its checks is built
          but not put live, so this stays on the last one that passed.
        </p>
      </Panel>
    </div>
  );
}
