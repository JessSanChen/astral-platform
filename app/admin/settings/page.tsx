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
          reviewBatchSize={settings.reviewBatchSize}
          maxReviewsPerTranscript={settings.maxReviewsPerTranscript}
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
          can wait until the end of the day. Submitted transcripts keep one
          immutable snapshot per version, alongside the raw request and
          response from the provider.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          One line of JSON per record. Transcripts come first, then
          nominations, and every line says which it is in its{" "}
          <code className="rounded bg-muted px-1 text-xs">record</code> field,
          so the file holds more lines than there are transcripts.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A transcript&apos;s messages can run on past what was submitted, if
          its author kept chatting afterwards. Each message carries{" "}
          <code className="rounded bg-muted px-1 text-xs">in_submitted_version</code>,
          and the labels and the review describe only the ones where it is
          true.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Conversations that were never submitted are in the file too, marked{" "}
          <code className="rounded bg-muted px-1 text-xs">
            &quot;status&quot;: &quot;draft&quot;
          </code>
          , with whatever labels their author had filled in so far. They are
          saved message by message as they happen, so nothing is lost when
          someone does not get as far as submitting.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <a href="/api/admin/export" className="text-sm text-accent underline">
            Download everything as JSONL
          </a>
          <a
            href="/api/admin/export?only=submitted"
            className="text-sm text-accent underline"
          >
            Submitted transcripts only
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
