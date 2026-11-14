import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, ChevronDown, Lock } from "lucide-react";
import { requireAdmin } from "@/lib/gate";
import {
  participantDetail,
  participantHistory,
  type HistoryLabels,
} from "@/lib/admin";
import { CHALLENGE_FLAGS, MODEL_BEHAVIOURS, TRANSCRIPT_TYPES } from "@/lib/labels";
import { trackLabel } from "@/lib/nominations";
import { withOther } from "@/lib/onboarding-schema";
import { REVIEW_ACTORS, REVIEW_INTENTS } from "@/lib/review-schema";
import { formatEventDateTime } from "@/lib/time";
import { ExpandAll, MessageText } from "@/components/admin-history";
import { Panel } from "@/components/admin-ui";
import { cn } from "@/lib/utils";

const labelOf = (list: readonly { value: string; label: string }[], value: string | null | undefined) =>
  list.find((item) => item.value === value)?.label ?? value ?? "";

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

/**
 * One participant's whole output, for the quality judgement that decides the
 * two counted prizes. Counts alone cannot tell apart careful work from
 * someone clicking through, so this shows what they actually wrote: every
 * conversation in full, beside the labels they gave it.
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
  const { account, profile, reviews, nominations } = detail;

  // A conversation opened and never typed into is not a transcript.
  const transcripts = history.filter((c) => c.messages.length > 0);
  const empty = history.length - transcripts.length;
  const counts: Record<Filter, number> = {
    all: transcripts.length,
    submitted: transcripts.filter((c) => c.submitted).length,
    drafts: transcripts.filter((c) => !c.submitted).length,
  };
  const shown = transcripts.filter((c) =>
    filter === "all" ? true : filter === "submitted" ? c.submitted : !c.submitted,
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
        {profile && (
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.affiliation} · {withOther(profile.role, profile.roleOther)} ·{" "}
            {withOther(profile.highestDegree, profile.highestDegreeOther)} ·{" "}
            {profile.yearsExperience} years ·{" "}
            {withOther(profile.primaryBackground, profile.primaryBackgroundOther)}
            {profile.subdomains.length > 0 &&
              ` · ${profile.subdomains
                .map((s) => withOther(s, profile.subdomainsOther))
                .join(", ")}`}
          </p>
        )}
        {profile?.expertiseNote && (
          <p className="mt-1 max-w-3xl text-sm">{profile.expertiseNote}</p>
        )}
      </div>

      <section aria-label="Conversations" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-sm font-semibold">Conversations</h2>
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
          Every conversation in full, newest first, beside the labels given to
          it. A submitted conversation shows the labels as submitted; one never
          submitted shows whatever its author had filled in.
          {empty > 0 &&
            ` ${empty} conversation${empty === 1 ? " was" : "s were"} opened and never typed into, and ${empty === 1 ? "is" : "are"} left out.`}
        </p>

        {shown.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {transcripts.length === 0 ? "No conversations yet." : "None of this kind."}
          </p>
        ) : (
          shown.map((c) => <Transcript key={c.id} conversation={c} />)
        )}
      </section>

      <Panel
        title={`Independent reviews they wrote (${reviews.length})`}
        description="What they said about other people's transcripts. Thin or repetitive answers are what to look for."
      >
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {reviews.map((r) => (
              <li key={r.conversationId} className="py-2.5">
                <p className="text-sm">
                  <span className="font-medium">{labelOf(REVIEW_INTENTS, r.intent)}</span>
                  {r.misusePresent ? ", misuse present" : ", no misuse"} ·
                  confidence {r.confidence}/5
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{r.goalText}</p>
                {r.notes && <p className="mt-0.5 text-xs">{r.notes}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  On &ldquo;{r.title}&rdquo; · {when(r.updatedAt)}
                  {r.submissionCount > 1 && ` · changed ${r.submissionCount - 1} time(s)`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {nominations.length > 0 && (
        <Panel title={`Nominations (${nominations.length})`}>
          <ul className="divide-y divide-border">
            {nominations.map((n) => (
              <li key={n.id} className="py-2.5">
                <p className="text-xs text-muted-foreground">{trackLabel(n.track)}</p>
                <p className="text-sm font-medium">{n.headline}</p>
                <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm">
                  {n.details}
                </p>
                {n.slidesUrl && (
                  <a
                    href={n.slidesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-accent underline"
                  >
                    Slides
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/** One conversation: what was said on the left, what was said about it on the right. */
function Transcript({ conversation: c }: { conversation: History[number] }) {
  const after = c.messages.filter((m) => m.afterSubmission).length;
  return (
    <details
      open
      data-transcript
      className="group rounded-[var(--radius)] border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{c.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.messages.length} turn{c.messages.length === 1 ? "" : "s"} · {c.modelId} ·
            started {when(c.createdAt)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            c.submitted ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground",
          )}
        >
          {c.submitted ? `Submitted v${c.currentVersion}` : "Not submitted"}
        </span>
        {c.lockedAt && (
          <span title="Reviewed, so its author can no longer change it">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
        )}
      </summary>

      <div className="grid gap-x-6 gap-y-4 border-t border-border px-4 py-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ol className="space-y-3">
          {c.scenario && (
            <li className="rounded-[var(--radius)] bg-muted/60 px-3 py-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                Scenario set by the author (sent to the model first)
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{c.scenario}</p>
            </li>
          )}
          {c.messages.map((m) => {
            const mine = m.role === "user";
            const empty = !mine && m.content.trim().length === 0;
            return (
              <li
                key={m.id}
                className={cn(
                  "rounded-[var(--radius)] border px-3 py-2 text-sm",
                  mine ? "border-accent/25 bg-accent/5" : "border-border",
                  m.evidence && "ring-1 ring-accent",
                  m.afterSubmission && "opacity-70",
                )}
              >
                <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">[{m.turn}]</span>
                  <span className="font-medium text-foreground">
                    {mine ? "Participant" : "Model"}
                  </span>
                  {m.evidence && (
                    <span className="flex items-center gap-1 font-medium text-accent">
                      <Bookmark className="h-3 w-3 fill-current" />
                      Marked as evidence
                    </span>
                  )}
                  {m.afterSubmission && <span>· added after submitting, not part of it</span>}
                </p>
                {empty ? (
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

        <aside className="space-y-4 text-sm lg:sticky lg:top-4 lg:self-start">
          <LabelsBlock labels={c.labels} submitted={c.submitted} />

          {c.submitted && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Submitted {when(c.lastSubmittedAt)}
              {after > 0 &&
                `. ${after} later message${after === 1 ? "" : "s"} not submitted`}
              .
            </p>
          )}

          {c.reviews.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                What reviewers said ({c.reviews.length})
              </p>
              {c.reviews.map((r, i) => (
                <div key={i} className="space-y-0.5">
                  <p>
                    <span className="font-medium">{labelOf(REVIEW_INTENTS, r.intent)}</span>
                    {r.misusePresent ? ", misuse present" : ", no misuse"} ·{" "}
                    {labelOf(REVIEW_ACTORS, r.actor)} · confidence {r.confidence}/5
                  </p>
                  <p className="text-muted-foreground">{r.goalText}</p>
                  {r.notes && <p className="text-xs">{r.notes}</p>}
                  <p className="text-xs text-muted-foreground">
                    {r.reviewerName} · v{r.reviewedVersion} · {when(r.submittedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {c.clipboard.length > 0 && (
            <div className="space-y-1 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Copy and paste
              </p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {c.clipboard.map((e) => (
                  <li key={`${e.kind}-${e.surface}`}>
                    {clipboardLine(e.kind, e.surface, e.times, e.characters)}
                  </li>
                ))}
              </ul>
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
  labels: { to: "into the labels", from: "from the labels" },
  review: { to: "into a review", from: "from a review" },
  other: { to: "elsewhere on the page", from: "from elsewhere on the page" },
};

function clipboardLine(kind: string, surface: string, times: number, characters: number) {
  const words = SURFACE_WORDS[surface] ?? SURFACE_WORDS.other;
  const verb = kind === "paste" ? "Pasted" : kind === "cut" ? "Cut" : "Copied";
  const where = kind === "paste" ? words.to : words.from;
  return `${verb} ${where} ${times} time${times === 1 ? "" : "s"}, ${characters.toLocaleString("en-US")} characters in all`;
}

function LabelsBlock({
  labels,
  submitted,
}: {
  labels: HistoryLabels | null;
  submitted: boolean;
}) {
  const filled =
    labels &&
    (labels.type ||
      labels.rolePreset ||
      labels.goalText ||
      labels.modelBehaviour ||
      (labels.domainTags?.length ?? 0) > 0 ||
      labels.notes);
  const heading = (
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {submitted ? "Labels, as submitted" : "Labels so far (not submitted)"}
    </p>
  );
  if (!labels || !filled) {
    return (
      <div className="space-y-1">
        {heading}
        <p className="text-muted-foreground">None filled in.</p>
      </div>
    );
  }

  const topics = (labels.domainTags ?? []).map((t) => withOther(t, labels.domainOther));
  const evidence = labels.evidenceTurns ?? [];
  return (
    <div className="space-y-2">
      {heading}
      <dl className="space-y-2">
        <Row term="Kind">{labelOf(TRANSCRIPT_TYPES, labels.type)}</Row>
        <Row term="Role played">
          {labels.rolePreset}
          {labels.roleText && (
            <span className="block text-muted-foreground">{labels.roleText}</span>
          )}
        </Row>
        <Row term="Trying to get the model to">{labels.goalText}</Row>
        <Row term="The model">{labelOf(MODEL_BEHAVIOURS, labels.modelBehaviour)}</Row>
        <Row term="Topics">{topics.join(", ")}</Row>
        <Row term="Evidence">
          {evidence.length > 0
            ? `Turn${evidence.length === 1 ? "" : "s"} ${evidence.join(", ")}`
            : ""}
        </Row>
        <Row term="Disagrees with the model">
          {labelOf(CHALLENGE_FLAGS, labels.challengeFlag)}
        </Row>
        <Row term="Notes">{labels.notes}</Row>
      </dl>
    </div>
  );
}

/** One label. Left out entirely when there is nothing to show. */
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
