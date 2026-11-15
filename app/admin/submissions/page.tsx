import Link from "next/link";
import { requireAdmin } from "@/lib/gate";
import { submissionsList, type SubmissionState as State } from "@/lib/admin";
import {
  ACTIVITY_TEMPLATES,
  comparisonIntentLabel,
} from "@/lib/episode-options";
import { getEventSettings } from "@/lib/openrouter";
import { ASSIGNMENT_STATES, MAIN_DIFFERENCE, OUTCOME_LABELS } from "@/lib/review-form";
import { formatEventDateTime } from "@/lib/time";
import { SubmissionState } from "@/components/admin-submissions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Submissions" };

// "Pending" is from when submissions waited for an organizer. Nothing is
// put in that state any more, so it is offered only if something is in it.
const FILTERS = [
  { value: "all", label: "All" },
  { value: "ready", label: "Available" },
  { value: "held", label: "Held" },
  { value: "withdrawn", label: "Withdrawn" },
];

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
    ? (state as State)
    : "all";

  // All of them, so the filter can show its counts; narrowed below.
  const [all, settings] = await Promise.all([submissionsList(), getEventSettings()]);
  const shown = filter === "all" ? all : all.filter((e) => e.assignmentState === filter);
  const countOf = (value: string) =>
    value === "all" ? all.length : all.filter((e) => e.assignmentState === value).length;

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
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
        Every submission is available to every reviewer as soon as it is submitted. Nobody is
        shown their own work, or two things from the same piece of work and its related versions,
        and a reviewer who finds one outside their expertise skips it. Each thing a reviewer can
        be shown (a conversation, or a folder read as a whole) aims for {settings.reviewsPerView}{" "}
        review{settings.reviewsPerView === 1 ? "" : "s"}. Hold one back, or withdraw it, only if
        it should not be shown at all.
      </p>

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
            {template && ` · ${template}`} ·{" "}
            {ep.status === "submitted"
              ? `submitted ${ep.submittedAt ? formatEventDateTime(ep.submittedAt) : ""}`
              : `folder still open, ${ep.sessions} session${ep.sessions === 1 ? "" : "s"} submitted by ${ep.sessions === 1 ? "itself" : "themselves"}`}
          </p>
          {ep.relatedTo && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Related version of &ldquo;{ep.relatedTo.sourceTitle}&rdquo; (
              {comparisonIntentLabel(ep.relatedTo.comparisonIntent)})
              {ep.relatedTo.intendedDifference ? `: ${ep.relatedTo.intendedDifference}` : ""}
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
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            STATE_TONE[ep.assignmentState] ?? STATE_TONE.pending,
          )}
        >
          {ep.assignmentState === "ready"
            ? "Available"
            : (ASSIGNMENT_STATES.find((s) => s.value === ep.assignmentState)?.label ??
              ep.assignmentState)}
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

      <SubmissionState
        episodeId={ep.id}
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
  link: {
    targetStatus: string;
    auditMainDifference: string | null;
    auditDone: boolean;
    auditInProgress: boolean;
  };
}) {
  if (link.auditDone) {
    const found = MAIN_DIFFERENCE.find((c) => c.value === link.auditMainDifference)?.label;
    return <span>compared{found ? `, main difference: ${found}` : ""}</span>;
  }
  if (link.auditInProgress) return <span>comparison in progress</span>;
  if (link.targetStatus !== "submitted") return <span>no comparison until both are submitted</span>;
  return <span>not compared yet</span>;
}
