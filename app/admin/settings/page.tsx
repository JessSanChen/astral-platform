import { requireAdmin } from "@/lib/gate";
import { getEventSettings } from "@/lib/openrouter";
import { Panel } from "@/components/admin-ui";
import { EventSettingsForm } from "@/components/admin-settings";

export default async function AdminSettings() {
  await requireAdmin();
  const settings = await getEventSettings();

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
        />
      </Panel>

      <Panel
        title="Models participants can choose"
        description="Edited in the database for now. Check them against the provider before the event with: npm run check-models"
      >
        <ul className="space-y-1 text-sm">
          {settings.enabledModels.map((model) => (
            <li key={model.id} className="flex items-baseline gap-2">
              <span className="font-medium">{model.displayName}</span>
              <span className="text-xs text-muted-foreground">{model.id}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Exporting the data">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Everything lives in Postgres and nothing is deleted, so the export can
          wait until the end of the day. Submitted transcripts keep one
          immutable snapshot per version, alongside the raw request and
          response from the provider.
        </p>
        <a
          href="/api/admin/export"
          className="mt-3 inline-block text-sm text-accent underline"
        >
          Download everything as JSONL
        </a>
      </Panel>
    </div>
  );
}
