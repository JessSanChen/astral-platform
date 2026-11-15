"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { submitReviewAction } from "@/app/review/actions";
import { useClipboardLog } from "@/components/clipboard-log";
import { Radios } from "@/components/intake-fields";
import {
  Checks,
  Question,
  ReviewFinished,
  clearDraft,
  readDraft,
  useStillHere,
  writeDraft,
} from "@/components/review-shared";
import { ReviewSkip } from "@/components/review-skip";
import { ReviewTranscript } from "@/components/review-transcript";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ViewContent } from "@/lib/episodes";
import {
  AIM_EVIDENCE,
  CONFIDENCE,
  EMPTY_REVIEW,
  EVIDENCE_MODES,
  REVIEW_INSTRUCTION,
  REVIEW_LIMITS,
  SUBJECT_SENSITIVITY,
  UNCERTAINTY_REASONS,
  VERDICTS,
  type ReviewDraft,
} from "@/lib/review-form";

export type ReviewWorkspaceProps = {
  assignmentId: string;
  content: ViewContent;
  policy: { version: number; body: string };
  bases: { value: string; label: string; verdicts: string[] }[];
  anchorConversationId: string | null;
};

/**
 * One record and one form (form C).
 *
 * Everything is on the screen at once and any answer can be changed until
 * the form is submitted; then it is final. What has been filled in is kept
 * in this browser, so a reload or a pause loses nothing.
 */
export default function ReviewWorkspace({
  assignmentId,
  content,
  policy,
  bases,
  anchorConversationId,
}: ReviewWorkspaceProps) {
  const key = `astral.review.${assignmentId}`;
  const [draft, setDraft] = useState<ReviewDraft>(() => readDraft(key, EMPTY_REVIEW));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"form" | "skip" | "done" | "skipped">("form");
  const [pending, start] = useTransition();
  const clipboard = useClipboardLog(anchorConversationId ?? "");
  useStillHere(assignmentId, mode === "form" || mode === "skip");

  useEffect(() => {
    if (mode === "form" || mode === "skip") writeDraft(key, draft);
  }, [key, draft, mode]);

  const set = (patch: Partial<ReviewDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const field of Object.keys(patch)) delete next[field];
      return next;
    });
  };

  // Only the criteria that go with the answer given are offered.
  const fitting = bases.filter((b) => !draft.verdict || b.verdicts.includes(draft.verdict));

  function chooseVerdict(verdict: string) {
    const stillFits = bases.some((b) => b.value === draft.policyBasis && b.verdicts.includes(verdict));
    set({ verdict, policyBasis: stillFits ? draft.policyBasis : "" });
  }

  function toggleTurn(n: number) {
    const has = draft.evidenceTurns.includes(n);
    set({
      evidenceMode: "turns",
      evidenceTurns: has
        ? draft.evidenceTurns.filter((t) => t !== n)
        : [...draft.evidenceTurns, n].sort((a, b) => a - b),
    });
  }

  function submit() {
    setMessage(null);
    start(async () => {
      const result = await submitReviewAction(assignmentId, draft);
      if (result.ok) {
        clearDraft(key);
        return setMode("done");
      }
      setMessage(result.message);
      setErrors(result.errors ?? {});
    });
  }

  const uncertaintyRequired = draft.verdict === "indeterminate" || draft.confidence === "low";
  const linked = content.kind === "linked";

  return (
    <div className="flex h-full" {...(anchorConversationId ? clipboard : {})}>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <span className="text-sm font-medium">
            {linked
              ? `Linked sessions (${content.sessions.length}), in the order things happened`
              : "One session"}
          </span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {content.turns.length} turn{content.turns.length === 1 ? "" : "s"}
            {(mode === "form" || mode === "skip") && (
              <Link href="/review" className="rounded border border-border px-2 py-1 text-foreground hover:bg-muted">
                Pause
              </Link>
            )}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ReviewTranscript
            content={content}
            selected={draft.evidenceTurns}
            onToggle={mode === "form" ? toggleTurn : undefined}
          />
        </div>
      </div>

      <aside
        data-clip="review"
        aria-label="Review form"
        className="flex w-[27rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-muted/20"
      >
        {mode === "done" && (
          <ReviewFinished
            heading="Review recorded"
            detail="Thank you. Your answer is final and has been saved."
            purpose="primary"
          />
        )}
        {mode === "skipped" && (
          <ReviewFinished
            heading="Skipped"
            detail="Noted, with your reason. Nothing else was recorded for this item."
            purpose="primary"
          />
        )}
        {mode === "skip" && (
          <ReviewSkip
            assignmentId={assignmentId}
            onCancel={() => setMode("form")}
            onSkipped={() => {
              clearDraft(key);
              setMode("skipped");
            }}
          />
        )}
        {mode === "form" && (
          <div className="space-y-6 p-4">
            <p className="text-xs leading-relaxed text-muted-foreground">{REVIEW_INSTRUCTION}</p>
            <details className="rounded-[var(--radius)] border border-border bg-card px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                Reference policy (version {policy.version})
              </summary>
              <div className="markdown mt-2 text-sm leading-relaxed">
                <ReactMarkdown>{policy.body}</ReactMarkdown>
              </div>
            </details>

            <Question
              id="verdict"
              text="Does this visible record warrant specialist review under the reference policy?"
              error={errors.verdict}
            >
              <Radios
                name="verdict"
                legend="Does this visible record warrant specialist review under the reference policy?"
                value={draft.verdict}
                options={VERDICTS}
                onChange={chooseVerdict}
              />
            </Question>

            <Question
              id="policyBasis"
              text="Which criterion supports your answer?"
              hint={draft.verdict ? undefined : "Answer the question above first."}
              error={errors.policyBasis}
            >
              {draft.verdict && fitting.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The policy lists no criterion for this answer. Tell an organizer.
                </p>
              ) : (
                draft.verdict && (
                  <Radios
                    name="policyBasis"
                    legend="Which criterion supports your answer?"
                    value={draft.policyBasis}
                    options={fitting}
                    onChange={(policyBasis) => set({ policyBasis })}
                  />
                )
              )}
            </Question>

            <Question
              id="confidence"
              text="How confident are you in applying the policy here?"
              error={errors.confidence}
            >
              <Radios
                name="confidence"
                legend="How confident are you in applying the policy here?"
                value={draft.confidence}
                options={CONFIDENCE}
                onChange={(confidence) => set({ confidence })}
              />
            </Question>

            <Question
              id="evidenceMode"
              text="Which turns are most relevant to your judgment?"
              error={errors.evidenceMode ?? errors.evidenceTurns}
            >
              <Radios
                name="evidenceMode"
                legend="Which turns are most relevant to your judgment?"
                value={draft.evidenceMode}
                options={EVIDENCE_MODES}
                onChange={(evidenceMode) => set({ evidenceMode })}
              />
              {draft.evidenceMode === "turns" && (
                <p className="text-xs text-muted-foreground" data-testid="evidence-summary">
                  {draft.evidenceTurns.length === 0
                    ? "None chosen yet. Click the number beside a turn."
                    : `Chosen: ${draft.evidenceTurns.join(", ")}`}
                </p>
              )}
            </Question>

            <Question
              id="rationale"
              text="Briefly explain your decision and its most important limitation."
              hint="One or two sentences."
              error={errors.rationale}
            >
              <Textarea
                aria-label="Briefly explain your decision and its most important limitation."
                value={draft.rationale}
                maxLength={REVIEW_LIMITS.rationale}
                onChange={(e) => set({ rationale: e.target.value })}
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {draft.rationale.length} / {REVIEW_LIMITS.rationale}
              </p>
            </Question>

            <Question
              id="uncertaintyReasons"
              text="What prevents a clearer judgment?"
              hint={
                uncertaintyRequired
                  ? "Needed, because you answered Cannot determine or Low confidence."
                  : "Optional."
              }
              error={errors.uncertaintyReasons ?? errors.uncertaintyOther}
            >
              <Checks
                legend="What prevents a clearer judgment?"
                options={UNCERTAINTY_REASONS}
                value={draft.uncertaintyReasons}
                onChange={(uncertaintyReasons) => set({ uncertaintyReasons })}
              />
              {draft.uncertaintyReasons.includes("other") && (
                <Input
                  aria-label="Other reason"
                  placeholder="Say what"
                  value={draft.uncertaintyOther}
                  maxLength={REVIEW_LIMITS.uncertaintyOther}
                  onChange={(e) => set({ uncertaintyOther: e.target.value })}
                />
              )}
            </Question>

            <Question
              id="subjectSensitivity"
              text="Considering the scientific subject and requested activity, without assuming a harmful purpose, how much biosecurity sensitivity is present?"
              error={errors.subjectSensitivity}
            >
              <Radios
                name="subjectSensitivity"
                legend="How much biosecurity sensitivity is present?"
                value={draft.subjectSensitivity}
                options={SUBJECT_SENSITIVITY}
                onChange={(subjectSensitivity) => set({ subjectSensitivity })}
              />
            </Question>

            <Question
              id="aimEvidence"
              text="What does the visible record establish about a concerning aim, rather than merely a sensitive topic?"
              error={errors.aimEvidence}
            >
              <Radios
                name="aimEvidence"
                legend="What does the visible record establish about a concerning aim?"
                value={draft.aimEvidence}
                options={AIM_EVIDENCE}
                onChange={(aimEvidence) => set({ aimEvidence })}
              />
            </Question>

            {message && (
              <p role="alert" className="rounded-[var(--radius)] bg-danger/10 px-3 py-2 text-sm text-danger">
                {message}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <Button variant="outline" disabled={pending} onClick={() => setMode("skip")}>
                Skip
              </Button>
              <Button disabled={pending} onClick={submit}>
                {pending ? "Submitting..." : "Submit review"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your answers are kept in this browser until you submit. Once
              submitted, a review cannot be changed.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
