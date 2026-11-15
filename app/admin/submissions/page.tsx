import Link from "next/link";
import { Trophy } from "lucide-react";
import { requireAdmin } from "@/lib/gate";
import { reviewerPool, submissionsList, type SubmissionState } from "@/lib/admin";
import {
  ACTIVITY_TEMPLATES,
  comparisonIntentLabel,
  provenanceLabel,
} from "@/lib/episode-options";
import { getEventSettings } from "@/lib/openrouter";
import { ASSIGNMENT_STATES, COMPARISON_TYPES, OUTCOME_LABELS } from "@/lib/review-form";
import { formatEventDateTime } from "@/lib/time";
import { ReleaseAllPending, SubmissionRouting } from "@/components/admin-submissions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Submissions" };

const FILTERS = [{ value: "all", label: "All" }, ...ASSIGNMENT_STATES];

const STATE_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  ready: "bg-accent/10 text-accent",
  held: "bg-danger/10 text-danger",
  withdrawn: "bg-danger/10 text-danger",
};

type Submission = Awaited<ReturnType<typeof submissionsList>>[number];

/**
 * Every submitted piece of work, and the organizers' part in getting it
 * reviewed: saying who is able to review it, releasing it, holding it back,
 * and watching how far the reviewing has got.
 *
 * A submission starts as Pending and is shown to nobody until it is given a
 * level and made Ready here (or everything is released at once, or the
 * setting to release automatically is on).
 */
export default async function AdminSubmissions({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  await requireAdmin();
  const { state } = await searchParams;
  const filter = ASSIGNMENT_STATES.some((s) => s.value === state)
    ? (state as SubmissionState)
    : "all";

  // All of them, so the filter can show its counts; narrowed below.
  const [all, pool, settings] = await Promise.all([
    submissionsList(),
    reviewerPool(),
    getEventSettings(),
  ]);
  const shown = filter === "all" ? all : all.filter((e) => e.assignmentState === filter);
  const countOf = (value: string) =>
    value === "all" ? all.length : all.filter((e) => e.assignmentState === value).length;
  const waiting = all.filter((e) => e.assignmentState === "pending" && !e.reviewLevel).length;

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/admin/submissions" : `/admin/submissions?state=${f.value}`}
            aria-current={filter === f.value ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-sm transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} ({countOf(f.value)})
          </Link>
        ))}
        <span className="ml-auto">
          <ReleaseAllPending waiting={waiting} />
        </span>
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
        Nothing is shown to a reviewer until it is <strong>Ready</strong> with a level.{" "}
        <strong>General</strong> can go to anyone who has passed the instruction check;{" "}
        <strong>Routine domain</strong> only to someone who rated themselves F2 or F3 in one of
        the subjects you tick; <strong>Specialist</strong> only F3. <strong>Unresolved</strong>{" "}
        is for something you cannot place yet, and is never handed out. Each thing a reviewer
        can be shown (a conversation, or a folder read as a whole) aims for{" "}
        {settings.reviewsPerView} review{settings.reviewsPerView === 1 ? "" : "s"}; nobody is
        shown their own work, or two things from the same piece of work and its related versions.
        {settings.autoReleaseSubmissions
          ? " New submissions are being released automatically as General (Settings)."
          : " New submissions wait here as Pending (change this in Settings)."}
      </p>

      <ReviewerPool pool={pool} />

      {shown.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {all.length === 0 ? "Nothing has been submitted yet." : "None in this state."}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((ep) => (
            <li key={ep.id}>
              <SubmissionCard episode={ep} target={settings.reviewsPerView} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmissionCard({ episode: ep, target }: { episode: Submission; target: number }) {
  const template = ACTIVITY_TEMPLATES.find((t) => t.id === ep.activityTemplate)?.label;
  const activeHolders = ep.views.reduce((sum, v) => sum + v.active, 0);
  const headingId = `submission-${ep.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="space-y-3 rounded-[var(--radius)] border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="truncate text-sm font-medium">
            {ep.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Link
              href={`/admin/participants/${ep.authorId}?show=submitted`}
              className="text-accent underline"
            >
              {ep.authorName}
            </Link>{" "}
            ·{" "}
            {ep.isFolder
              ? `Folder, ${ep.sessions} session${ep.sessions === 1 ? "" : "s"}`
              : "Conversation"}{" "}
            · {ep.modelId} · {provenanceLabel(ep.taskProvenance)}
            {template && ` · ${template}`} · submitted{" "}
            {ep.submittedAt ? formatEventDateTime(ep.submittedAt) : ""}
          </p>
          {ep.relatedTo && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Related version of &ldquo;{ep.relatedTo.sourceTitle}&rdquo; (
              {comparisonIntentLabel(ep.relatedTo.comparisonIntent)}): {ep.relatedTo.intendedDifference}
              {" · "}
              <PairAudit link={ep.relatedTo} />
            </p>
          )}
          {ep.relatedVersions.map((link) => (
            <p key={link.id} className="mt-0.5 text-xs text-muted-foreground">
              Has a related version, &ldquo;{link.targetTitle}&rdquo;
              {link.targetStatus !== "submitted" ? " (not submitted yet)" : ""}
              {" · "}
              <PairAudit link={link} />
            </p>
          ))}
        </div>
        {ep.prizeEntryAt && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
            <Trophy className="h-3 w-3" />
            Prize entry
          </span>
        )}
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            STATE_TONE[ep.assignmentState] ?? STATE_TONE.pending,
          )}
        >
          {ASSIGNMENT_STATES.find((s) => s.value === ep.assignmentState)?.label ??
            ep.assignmentState}
        </span>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs" aria-label="Review coverage">
        {ep.views.map((v) => (
          <li key={v.id}>
            <span className="font-medium">{v.name}</span>:{" "}
            <span className="tabular-nums">
              {v.completed} of {target} reviewed
            </span>
            {v.active > 0 && `, ${v.active} in progress`}
            {v.skipped > 0 && `, ${v.skipped} skipped`}
            {v.expired > 0 && `, ${v.expired} ran out`}
            <span className="text-muted-foreground"> · {OUTCOME_LABELS[v.outcome]}</span>
          </li>
        ))}
      </ul>

      <SubmissionRouting
        episodeId={ep.id}
        reviewLevel={ep.reviewLevel}
        eligibleDomains={ep.eligibleDomains}
        assignmentState={ep.assignmentState}
        activeHolders={activeHolders}
      />
    </article>
  );
}

/** Whether a pair of versions has been compared yet, and what was found. */
function PairAudit({
  link,
}: {
  link: { targetStatus: string; auditComparisonType: string | null; auditInProgress: boolean };
}) {
  if (link.auditComparisonType) {
    return (
      <span>
        compared:{" "}
        {COMPARISON_TYPES.find((c) => c.value === link.auditComparisonType)?.label ??
          link.auditComparisonType}
      </span>
    );
  }
  if (link.auditInProgress) return <span>comparison in progress</span>;
  if (link.targetStatus !== "submitted") return <span>no comparison until both are submitted</span>;
  return <span>not compared yet</span>;
}

function ReviewerPool({ pool }: { pool: Awaited<ReturnType<typeof reviewerPool>> }) {
  const anyone = pool.domains.filter((d) => d.everyone.routine > 0);
  return (
    <details className="rounded-[var(--radius)] border border-border bg-card">
      <summary className="cursor-pointer px-4 py-2.5 text-sm">
        <span className="font-medium">Who can review</span>{" "}
        <span className="text-xs text-muted-foreground">
          {pool.policyVersion === 0
            ? "No policy is published, so nobody can review yet."
            : `${pool.ready} of ${pool.onboarded} people have passed the instruction check for policy version ${pool.policyVersion}.`}
        </span>
      </summary>
      <div className="border-t border-border px-4 py-3">
        <Panelless>
          Look here before marking something Routine or Specialist: with nobody in a column, it
          will sit unreviewed. Counts are of people who can review now, with everyone who has
          joined in brackets.
        </Panelless>
        {anyone.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nobody has rated themselves F2 or F3 in any subject yet, so only General items can be
            reviewed.
          </p>
        ) : (
          <table className="mt-2 text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-6 font-medium">Subject</th>
                <th className="py-1 pr-6 text-right font-medium">Routine (F2 or F3)</th>
                <th className="py-1 text-right font-medium">Specialist (F3)</th>
              </tr>
            </thead>
            <tbody>
              {anyone.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-1 pr-6">{d.label}</td>
                  <td className="py-1 pr-6 text-right tabular-nums">
                    {d.routine} ({d.everyone.routine})
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {d.specialist} ({d.everyone.specialist})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}

function Panelless({ children }: { children: React.ReactNode }) {
  return <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
