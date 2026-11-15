import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { requireAdmin } from "@/lib/gate";
import { participantDetail, participantHistory } from "@/lib/admin";
import { trackLabel } from "@/lib/nominations";
import {
  ACTIVITY_TEMPLATES,
  comparisonIntentLabel,
  provenanceLabel,
  sessionLetter,
} from "@/lib/episode-options";
import {
  AI_USE,
  BACKGROUND_RESPONSES,
  EXPERIENCE_BANDS,
  FOCUS_TAGS,
  ROLES,
  WORK_AREAS,
  domainLabel,
  intakeDraft,
} from "@/lib/intake";
import {
  AIM_EVIDENCE,
  ASSIGNMENT_STATES,
  BUILT_IN_BASES,
  COMPARISON_TYPES,
  CONFIDENCE,
  MATCH,
  OUTCOME_LABELS,
  REVIEW_LEVELS,
  SKIP_REASONS,
  SUBJECT_SENSITIVITY,
  UNCERTAINTY_REASONS,
  UNINTENDED,
  VERDICTS,
} from "@/lib/review-form";
import { formatEventDateTime } from "@/lib/time";
import { ExpandAll, MessageText } from "@/components/admin-history";
import { Panel } from "@/components/admin-ui";
import { cn } from "@/lib/utils";

const labelOf = (
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
) => list.find((item) => item.value === value)?.label ?? value ?? "";

function when(d: Date | null | undefined) {
  return d ? formatEventDateTime(d) : "";
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "drafts", label: "Not submitted" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

type History = Awaited<ReturnType<typeof participantHistory>>;
type Detail = Awaited<ReturnType<typeof participantDetail>>;

/**
 * One participant's whole output: who they said they are, every piece of
 * work in full with what they said about it, and what they did as a
 * reviewer. Counts cannot tell careful work from clicking through, so this
 * shows what was actually written.
 */
export default async function ParticipantDetail({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const { show } = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.key === show) ? (show as Filter) : "all";

  const [detail, history] = await Promise.all([
    participantDetail(userId),
    participantHistory(userId),
  ]);
  if (!detail.account) notFound();
  const { account, profile, reviews, audits, skips, nominations } = detail;

  // Something opened and never typed into is not work.
  const work = history.filter((e) => e.messageCount > 0);
  const empty = history.length - work.length;
  const counts: Record<Filter, number> = {
    all: work.length,
    submitted: work.filter((e) => e.submitted).length,
    drafts: work.filter((e) => !e.submitted).length,
  };
  const shown = work.filter((e) =>
    filter === "all" ? true : filter === "submitted" ? e.submitted : !e.submitted,
  );

  return (
    <div className="space-y-5 px-5 py-5">
      <Link
        href="/admin/participants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All participants
      </Link>

      <div>
        <h1 className="font-serif text-2xl font-medium tracking-tight">{account.name}</h1>
        <p className="text-sm text-muted-foreground">{account.email}</p>
      </div>

      <IntakeAnswers profile={profile} completed={account.profileCompletedAt != null} />

      <section aria-label="Work" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-sm font-semibold">Work</h2>
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={
                f.key === "all"
                  ? `/admin/participants/${userId}`
                  : `/admin/participants/${userId}?show=${f.key}`
              }
              aria-current={filter === f.key ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} ({counts[f.key]})
            </Link>
          ))}
          {shown.length > 1 && (
            <span className="ml-auto">
              <ExpandAll />
            </span>
          )}
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Every conversation and folder in full, newest first, beside what its
          author said about it. Submitted work is frozen as it was submitted;
          a draft is shown as it stands.
          {empty > 0 &&
            ` ${empty} ${empty === 1 ? "was" : "were"} opened and never typed into, and ${empty === 1 ? "is" : "are"} left out.`}
        </p>

        {shown.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {work.length === 0 ? "Nothing yet." : "None of this kind."}
          </p>
        ) : (
          shown.map((e) => <Episode key={e.id} episode={e} />)
        )}
      </section>

      <Panel
        title={`Reviews they completed (${reviews.length})`}
        description="Their answers about other people's work. Thin or repetitive reasons are what to look for."
      >
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {reviews.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </ul>
        )}
      </Panel>

      {audits.length > 0 && (
        <Panel
          title={`Comparisons they completed (${audits.length})`}
          description="How well they judged a pair of related versions to match."
        >
          <ul className="divide-y divide-border">
            {audits.map((a) => (
              <li key={a.id} className="space-y-0.5 py-2.5 text-sm">
                <p className="font-medium">{labelOf(COMPARISON_TYPES, a.comparisonType)}</p>
                <p className="text-muted-foreground">
                  Topic and task comparable: {labelOf(MATCH, a.topicTaskMatch)} · sensitivity held
                  constant: {labelOf(MATCH, a.sensitivityMatch)} · intended change visible:{" "}
                  {labelOf(MATCH, a.intendedChangeRealized)}
                </p>
                <p className="text-muted-foreground">
                  Unintended differences:{" "}
                  {a.unintendedDifferences.map((d) => labelOf(UNINTENDED, d)).join(", ")}
                  {a.unintendedOther && ` (${a.unintendedOther})`}
                </p>
                {a.auditNote && <p>{a.auditNote}</p>}
                <p className="text-xs text-muted-foreground">
                  The author meant to change: {a.intendedDifference} · {when(a.submittedAt)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {nominations.length > 0 && (
        <Panel
          title={`Nominations (${nominations.length})`}
          description="What they wrote up for a prize, as it stands now."
        >
          <ul className="divide-y divide-border">
            {nominations.map((n) => (
              <li key={n.id} className="space-y-1 py-2.5 text-sm">
                <p>
                  <span className="font-medium">{n.headline}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {trackLabel(n.track)} · updated {when(n.updatedAt)}
                  </span>
                </p>
                <p className="whitespace-pre-wrap text-muted-foreground">{n.details}</p>
                {n.slidesUrl && <p className="break-all text-xs">Slides: {n.slidesUrl}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {skips.length > 0 && (
        <Panel
          title={`Items they did not finish (${skips.length})`}
          description="Skipped with a reason, or left until the reservation ran out. Neither counts against anyone."
        >
          <ul className="divide-y divide-border">
            {skips.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <span className="font-medium">
                  {s.state === "expired"
                    ? "Ran out of time"
                    : `Skipped: ${labelOf(SKIP_REASONS, s.skipReason)}`}
                </span>
                {s.skipNote && <span> · {s.skipNote}</span>}
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {s.purpose === "pair_audit" ? "a comparison" : "a review"} · given{" "}
                  {when(s.reservedAt)}
                  {s.finishedAt && `, ended ${when(s.finishedAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/** One completed review, as the reviewer answered form C. */
function ReviewItem({ review: r }: { review: Detail["reviews"][number] }) {
  const minutes = Math.max(
    1,
    Math.round((r.submittedAt.getTime() - r.reservedAt.getTime()) / 60000),
  );
  return (
    <li className="space-y-0.5 py-2.5 text-sm">
      <p>
        <span className="font-medium">
          Warrants specialist review: {labelOf(VERDICTS, r.verdict)}
        </span>{" "}
        · basis: {labelOf(BUILT_IN_BASES, r.policyBasis)} · confidence{" "}
        {labelOf(CONFIDENCE, r.confidence).toLowerCase()}
      </p>
      <p className="whitespace-pre-wrap">{r.rationale}</p>
      <p className="text-muted-foreground">
        Evidence:{" "}
        {r.evidenceMode === "turns"
          ? `turn${r.evidenceTurns.length === 1 ? "" : "s"} ${r.evidenceTurns.join(", ")}`
          : "none specific; judged on what is absent"}
        {r.uncertaintyReasons.length > 0 &&
          ` · unsure because: ${r.uncertaintyReasons
            .map((u) => labelOf(UNCERTAINTY_REASONS, u))
            .join(", ")}${r.uncertaintyOther ? ` (${r.uncertaintyOther})` : ""}`}
      </p>
      <p className="text-muted-foreground">
        Subject sensitivity: {labelOf(SUBJECT_SENSITIVITY, r.subjectSensitivity)}
      </p>
      <p className="text-muted-foreground">
        Evidence of aim: {labelOf(AIM_EVIDENCE, r.aimEvidence)}
      </p>
      <p className="text-xs text-muted-foreground">
        On &ldquo;{r.episodeTitle}&rdquo;
        {r.viewKind === "linked" ? " (all sessions together)" : ""} · policy version{" "}
        {r.policyVersion} · {when(r.submittedAt)} · about {minutes} min after being given it
      </p>
    </li>
  );
}

/** What someone answered on the intake form (form A). */
function IntakeAnswers({ profile, completed }: { profile: Detail["profile"]; completed: boolean }) {
  if (!profile?.intake) {
    return (
      <p className="rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {completed
          ? "No intake answers are stored for this account."
          : "Has not finished the intake form yet."}
      </p>
    );
  }
  const a = intakeDraft(profile.intake);
  const domains = a.backgroundDomains.map((d) =>
    d === "other" && a.otherDomainText ? `Other: ${a.otherDomainText}` : domainLabel(d),
  );
  const work = WORK_AREAS.filter((w) => a.work[w.key]).map(
    (w) =>
      `${w.label}: ${labelOf(EXPERIENCE_BANDS, a.work[w.key])}`,
  );
  const rated = Object.entries(a.familiarity).map(([id, level]) => `${domainLabel(id)}: ${level}`);
  return (
    <details className="group rounded-[var(--radius)] border border-border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" />
        Intake answers
        <span className="text-xs font-normal text-muted-foreground">
          form {profile.intakeVersion ?? "?"} · updated {when(profile.updatedAt)}
        </span>
      </summary>
      <dl className="grid gap-x-8 gap-y-2 border-t border-border px-4 py-3 text-sm md:grid-cols-2">
        <Row term="Role">
          {a.role === "other" && a.roleOther ? a.roleOther : labelOf(ROLES, a.role)}
        </Row>
        <Row term="Subject background">
          {a.backgroundDomains.length > 0
            ? domains.join("; ")
            : labelOf(BACKGROUND_RESPONSES, a.backgroundFlags[0] ?? "")}
        </Row>
        <Row term="Also works on">{a.focusTags.map((t) => labelOf(FOCUS_TAGS, t)).join("; ")}</Row>
        <Row term="Work personally performed">
          {work.join("\n")}
        </Row>
        <Row term="Familiarity for reviewing (self-rated; used for routing)">
          {rated.length > 0 ? rated.join("\n") : "Nothing rated: general items only"}
        </Row>
        <Row term="Uses AI assistants">{labelOf(AI_USE, a.aiUse)}</Row>
        <Row term="Agreed to take part">{when(profile.participationAgreedAt)}</Row>
        <Row term="Agreed to restricted research use">{when(profile.researchUseAgreedAt)}</Row>
        <Row term="Public release of their records">
          {profile.publicReleasePermission === "yes"
            ? "Yes"
            : profile.publicReleasePermission === "no"
              ? "No"
              : "Not answered (treated as no)"}
        </Row>
      </dl>
    </details>
  );
}

/** One episode: what was said on the left, what was said about it on the right. */
function Episode({ episode: e }: { episode: History[number] }) {
  const sessions = e.sessions.filter((s) => s.messages.length > 0);
  const several = sessions.length > 1;
  const template = ACTIVITY_TEMPLATES.find((t) => t.id === e.activityTemplate)?.label;
  const reviewed = e.views.reduce((sum, v) => sum + v.verdicts.length, 0);
  return (
    <details
      open
      data-transcript
      className="group rounded-[var(--radius)] border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{e.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {e.isFolder || several
              ? `Folder, ${sessions.length} session${sessions.length === 1 ? "" : "s"}`
              : "Conversation"}{" "}
            · {e.messageCount} turn{e.messageCount === 1 ? "" : "s"} · {e.modelId} · started{" "}
            {when(e.createdAt)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            e.submitted ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground",
          )}
        >
          {e.submitted ? "Submitted" : "Not submitted"}
        </span>
      </summary>

      <div className="grid gap-x-6 gap-y-4 border-t border-border px-4 py-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {sessions.map((s, i) => (
            <section key={s.id} aria-label={several ? `Session ${sessionLetter(i + 1)}` : undefined}>
              {several && (
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Session {sessionLetter(i + 1)}
                  <span className="normal-case tracking-normal"> · {s.title}</span>
                  {e.submitted && s.status !== "submitted" && (
                    <span className="normal-case tracking-normal"> · not part of the submission</span>
                  )}
                </h3>
              )}
              <ol className="space-y-3">
                {s.scenario && (
                  <li className="rounded-[var(--radius)] bg-muted/60 px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">
                      Scenario set by the author (sent to the model first)
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{s.scenario}</p>
                  </li>
                )}
                {s.messages.map((m) => {
                  const mine = m.role === "user";
                  const blank = !mine && m.content.trim().length === 0;
                  return (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-[var(--radius)] border px-3 py-2 text-sm",
                        mine ? "border-accent/25 bg-accent/5" : "border-border",
                      )}
                    >
                      <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">[{m.turn}]</span>
                        <span className="font-medium text-foreground">
                          {mine ? "Participant" : "Model"}
                        </span>
                        {!mine && !blank && m.finishReason === "aborted" && <span>· cut short</span>}
                      </p>
                      {blank ? (
                        <p className="italic text-muted-foreground">
                          No reply
                          {m.failed
                            ? ": the request failed or was blocked."
                            : m.finishReason === "content-filter"
                              ? ": a content filter stopped it."
                              : ": the model returned nothing, which usually means it refused."}
                        </p>
                      ) : (
                        <MessageText text={m.content} />
                      )}
                    </li>
                  );
                })}
              </ol>
              {s.clipboard.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {s.clipboard.map((c) => (
                    <li key={`${c.kind}-${c.surface}`}>
                      {clipboardLine(c.kind, c.surface, c.times, c.characters)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <aside className="space-y-4 text-sm lg:sticky lg:top-4 lg:self-start">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What the author said about it
            </p>
            <dl className="space-y-2">
              <Row term="Where the task came from">{provenanceLabel(e.taskProvenance)}</Row>
              <Row term="Starting point picked">{template}</Row>
              <Row term="Private goal note (never shown to the model or a reviewer)">
                {e.goalText}
              </Row>
              <Row term="Goal note saved">
                {e.goalRevisions.n > 0
                  ? `${e.goalRevisions.n} time${e.goalRevisions.n === 1 ? "" : "s"}${
                      e.goalRevisions.afterWorkBegan > 0
                        ? `, ${e.goalRevisions.afterWorkBegan} of them after the first message`
                        : ", all before the first message"
                    }`
                  : ""}
              </Row>
              {e.relatedTo && (
                <Row term="Made as a related version of">
                  &ldquo;{e.relatedTo.sourceTitle}&rdquo;
                  <span className="block text-muted-foreground">
                    {comparisonIntentLabel(e.relatedTo.comparisonIntent)}
                  </span>
                  <span className="block">Meant to change: {e.relatedTo.intendedDifference}</span>
                </Row>
              )}
              {e.relatedVersions.length > 0 && (
                <Row term="Related versions made of this">
                  {e.relatedVersions.map((l) => `“${l.targetTitle}”`).join(", ")}
                </Row>
              )}
            </dl>
          </div>

          {e.submitted && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Review
              </p>
              <dl className="space-y-2">
                <Row term="Submitted">{when(e.submittedAt)}</Row>
                <Row term="Routing">
                  {labelOf(ASSIGNMENT_STATES, e.assignmentState)}
                  {e.reviewLevel ? ` · ${labelOf(REVIEW_LEVELS, e.reviewLevel)}` : " · no level set"}
                  {e.eligibleDomains.length > 0 && (
                    <span className="block text-muted-foreground">
                      {e.eligibleDomains.map(domainLabel).join(", ")}
                    </span>
                  )}
                </Row>
                <Row term={`What reviewers said (${reviewed})`}>
                  {e.views
                    .map(
                      (v) =>
                        `${v.name}: ${
                          v.verdicts.length > 0
                            ? v.verdicts.map((x) => labelOf(VERDICTS, x)).join(", ")
                            : "no reviews yet"
                        } · ${OUTCOME_LABELS[v.outcome]}`,
                    )
                    .join("\n")}
                </Row>
              </dl>
            </div>
          )}
        </aside>
      </div>
    </details>
  );
}

const SURFACE_WORDS: Record<string, { to: string; from: string }> = {
  composer: { to: "into the message box", from: "from the message box" },
  message: { to: "onto a message", from: "from the conversation" },
  labels: { to: "into the details", from: "from the details" },
  review: { to: "into a review", from: "from a review" },
  other: { to: "elsewhere on the page", from: "from elsewhere on the page" },
};

function clipboardLine(kind: string, surface: string, times: number, characters: number) {
  const words = SURFACE_WORDS[surface] ?? SURFACE_WORDS.other;
  const incoming = kind === "paste" || kind === "drop";
  const verb =
    kind === "paste" ? "Pasted" : kind === "drop" ? "Dragged in" : kind === "cut" ? "Cut" : "Copied";
  const where = incoming ? words.to : words.from;
  return `${verb} ${where} ${times} time${times === 1 ? "" : "s"}, ${characters.toLocaleString("en-US")} characters in all`;
}

/** One answer. Left out entirely when there is nothing to show. */
function Row({ term, children }: { term: string; children: React.ReactNode }) {
  if (children == null || children === "" || children === false) return null;
  if (Array.isArray(children) && children.every((c) => c == null || c === "" || c === false))
    return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="whitespace-pre-wrap break-words">{children}</dd>
    </div>
  );
}
