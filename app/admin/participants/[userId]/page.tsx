import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { requireAdmin } from "@/lib/gate";
import { participantDetail } from "@/lib/admin";
import { trackLabel } from "@/lib/nominations";
import { Panel } from "@/components/admin-ui";

const TYPE_LABELS: Record<string, string> = {
  benign: "Benign",
  dual_use: "Dual use",
  adversarial: "Adversarial",
};

const INTENT_LABELS: Record<string, string> = {
  benign: "Benign",
  dual_use: "Dual use",
  adversarial: "Adversarial",
  unclear: "Cannot tell",
};

function when(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

/**
 * One participant's whole output, for the quality judgement that decides the
 * two counted prizes. Counts alone cannot tell apart careful work from
 * someone clicking through, so this shows what they actually wrote.
 */
export default async function ParticipantDetail({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const detail = await participantDetail(userId);
  if (!detail.account) notFound();

  const { account, profile, conversations, reviews, nominations } = detail;
  const submitted = conversations.filter((c) => c.status === "submitted");

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
        <h1 className="text-xl font-semibold">{account.name}</h1>
        <p className="text-sm text-muted-foreground">{account.email}</p>
        {profile && (
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.affiliation} · {profile.role} · {profile.highestDegree} ·{" "}
            {profile.yearsExperience} years · {profile.primaryBackground}
            {profile.subdomains.length > 0 && ` · ${profile.subdomains.join(", ")}`}
          </p>
        )}
        {profile?.expertiseNote && (
          <p className="mt-1 max-w-3xl text-sm">{profile.expertiseNote}</p>
        )}
      </div>

      <Panel
        title={`Transcripts (${submitted.length} submitted of ${conversations.length})`}
        description="Read a few before trusting the count. Speed is shown so a run of transcripts produced in seconds stands out."
      >
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.status === "submitted"
                        ? `Submitted v${c.currentVersion} at ${when(c.lastSubmittedAt)}`
                        : "Draft"}
                      {" · "}
                      {c.turns} turn{c.turns === 1 ? "" : "s"}
                      {" · "}
                      {c.modelId}
                      {c.lockedAt && " · reviewed, locked"}
                    </p>
                    {c.goalText && (
                      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                        Their stated goal: {c.goalText}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {c.type && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {TYPE_LABELS[c.type] ?? c.type}
                      </span>
                    )}
                    {c.lockedAt && (
                      <Lock className="ml-1 inline h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={`Independent reviews (${reviews.length})`}
        description="What they said about other people's transcripts. Thin or repetitive answers are what to look for."
      >
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {reviews.map((r) => (
              <li key={r.conversationId} className="py-2.5">
                <p className="text-sm">
                  <span className="font-medium">
                    {INTENT_LABELS[r.intent] ?? r.intent}
                  </span>
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
                {n.collaborators && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    With: {n.collaborators}
                  </p>
                )}
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
