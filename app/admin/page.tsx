import { requireAdmin } from "@/lib/gate";
import { overview, reviewCoverage } from "@/lib/admin";
import { getEventSettings } from "@/lib/openrouter";
import { trackLabel } from "@/lib/nominations";
import { Bars, Panel, Stat } from "@/components/admin-ui";
import { PauseChatButton } from "@/components/admin-controls";

const TYPE_LABELS: Record<string, string> = {
  benign: "Benign",
  dual_use: "Dual use",
  adversarial: "Adversarial",
};

const BEHAVIOUR_LABELS: Record<string, string> = {
  fully_complied: "Fully complied",
  partially_complied: "Partly complied",
  refused: "Refused",
  deflected: "Deflected",
};

export default async function AdminOverview() {
  await requireAdmin();
  const [data, coverage, settings] = await Promise.all([
    overview(),
    reviewCoverage(),
    getEventSettings(),
  ]);

  const unlabelled =
    data.conversations.submitted -
    data.byType.reduce((sum, row) => sum + Number(row.n), 0);

  return (
    <div className="space-y-5 px-5 py-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Participants" value={data.participants} />
        <Stat
          label="Transcripts submitted"
          value={data.conversations.submitted}
          hint={`${data.conversations.total} started`}
        />
        <Stat
          label="Independent reviews"
          value={data.reviews}
          hint={`${coverage.reviewed} of ${coverage.submitted} transcripts reviewed`}
        />
        <Stat
          label="Spend today"
          value={`$${data.spend.cost.toFixed(2)}`}
          hint={`${data.spend.tokens.toLocaleString()} tokens`}
        />
      </div>

      {settings.chatPaused && (
        <p className="rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">
          Chat is paused for everyone. Nobody can send a message until you
          resume it.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Transcripts by type"
          description="What authors labelled their own submitted transcripts."
        >
          <Bars
            rows={data.byType.map((row) => ({
              label: TYPE_LABELS[row.type ?? ""] ?? "Not labelled",
              value: Number(row.n),
            }))}
          />
          {unlabelled > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {unlabelled} submitted without a type.
            </p>
          )}
        </Panel>

        <Panel
          title="How the models responded"
          description="As reported by the authors."
        >
          <Bars
            rows={data.byBehaviour.map((row) => ({
              label: BEHAVIOUR_LABELS[row.behaviour ?? ""] ?? "Not labelled",
              value: Number(row.n),
            }))}
          />
        </Panel>

        <Panel title="Nominations" description="Entries received, by track.">
          <Bars
            rows={data.nominations.map((row) => ({
              label: trackLabel(row.track),
              value: Number(row.n),
            }))}
          />
        </Panel>

        <Panel title="Running the day">
          <div className="space-y-3">
            <PauseChatButton paused={settings.chatPaused} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Scanners have run {data.judgeRuns.total} times
              {data.judgeRuns.failed > 0
                ? `, ${data.judgeRuns.failed} of which failed`
                : ""}
              . Participants each get {settings.defaultJudgeRunsPerHour} runs an
              hour and a daily allowance of{" "}
              {settings.defaultDailyTokenBudget.toLocaleString()} tokens.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
