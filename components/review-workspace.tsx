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
  REVIEW_QUESTIONS,
  REVIEW_REMINDER,
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
  anchorConversationId: string | null;
};

/**
 * One record and one form (form C).
 *
 * What is judged is the user's visible activity, so only the user's
 * messages can be pointed to as evidence; the assistant's stay in view
 * for context.
 *
 * Everything is on the screen at once and any answer can be changed until
 * the form is submitted; then it is final. What has been filled in is kept
 * in this browser, so a reload or a pause loses nothing.
 */
export default function ReviewWorkspace({
  assignmentId,
  content,
  policy,
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

  // A recommendation to refer has to point at something the user did, so
  // "no specific evidence" is not on offer for Yes.
  const evidenceModes = EVIDENCE_MODES.filter(
    (m) => m.value !== "absence" || draft.verdict !== "yes",
  );

  function chooseVerdict(verdict: string) {
    set({
      verdict,
      evidenceMode: verdict === "yes" && draft.evidenceMode === "absence" ? "" : draft.evidenceMode,
    });
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
        <div className="relative flex-1 overflow-y-auto">
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
        className="relative flex w-[27rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-muted/20"
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
            <p className="text-xs leading-relaxed text-muted-foreground">{REVIEW_REMINDER}</p>
            <details className="rounded-[var(--radius)] border border-border bg-card px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                Review instructions (version {policy.version})
              </summary>
              <div className="markdown mt-2 text-sm leading-relaxed">
                <ReactMarkdown>{policy.body}</ReactMarkdown>
              </div>
            </details>

            <Question
              id="verdict"
              text={REVIEW_QUESTIONS.verdict}
              error={errors.verdict}
            >
              <Radios
                name="verdict"
                legend={REVIEW_QUESTIONS.verdict}
                value={draft.verdict}
                options={VERDICTS}
                onChange={chooseVerdict}
              />
            </Question>

            <Question
              id="confidence"
              text={REVIEW_QUESTIONS.confidence}
              error={errors.confidence}
            >
              <Radios
                name="confidence"
                legend={REVIEW_QUESTIONS.confidence}
                value={draft.confidence}
                options={CONFIDENCE}
                onChange={(confidence) => set({ confidence })}
              />
            </Question>

            <Question
              id="evidenceMode"
              text={REVIEW_QUESTIONS.evidence}
              hint="Only the user's messages can be chosen. The assistant's are there for context."
              error={errors.evidenceMode ?? errors.evidenceTurns}
            >
              <Radios
                name="evidenceMode"
                legend={REVIEW_QUESTIONS.evidence}
                value={draft.evidenceMode}
                options={evidenceModes}
                onChange={(evidenceMode) => set({ evidenceMode })}
              />
              {draft.evidenceMode === "turns" && (
                <p className="text-xs text-muted-foreground" data-testid="evidence-summary">
                  {draft.evidenceTurns.length === 0
                    ? "None chosen yet. Click the number beside one of the user's messages."
                    : `Chosen: ${draft.evidenceTurns.join(", ")}`}
                </p>
              )}
            </Question>

            <Question
              id="rationale"
              text={REVIEW_QUESTIONS.rationale}
              hint="One or two sentences."
              error={errors.rationale}
            >
              <Textarea
                aria-label={REVIEW_QUESTIONS.rationale}
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
              text={REVIEW_QUESTIONS.uncertainty}
              hint={
                uncertaintyRequired
                  ? "Needed, because you answered Cannot determine or Low confidence."
                  : "Optional."
              }
              error={errors.uncertaintyReasons ?? errors.uncertaintyOther}
            >
              <Checks
                legend={REVIEW_QUESTIONS.uncertainty}
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
              text={REVIEW_QUESTIONS.subjectSensitivity}
              error={errors.subjectSensitivity}
            >
              <Radios
                name="subjectSensitivity"
                legend={REVIEW_QUESTIONS.subjectSensitivity}
                value={draft.subjectSensitivity}
                options={SUBJECT_SENSITIVITY}
                onChange={(subjectSensitivity) => set({ subjectSensitivity })}
              />
            </Question>

            <Question
              id="aimEvidence"
              text={REVIEW_QUESTIONS.aimEvidence}
              error={errors.aimEvidence}
            >
              <Radios
                name="aimEvidence"
                legend={REVIEW_QUESTIONS.aimEvidence}
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
