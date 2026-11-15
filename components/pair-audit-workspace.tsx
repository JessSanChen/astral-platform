"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { submitAuditAction } from "@/app/review/actions";
import { useClipboardLog } from "@/components/clipboard-log";
import ReactMarkdown from "react-markdown";
import { Radios } from "@/components/intake-fields";
import {
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
import { Textarea } from "@/components/ui/textarea";
import type { ViewContent } from "@/lib/episodes";
import {
  AUDIT_NOTE_QUESTION,
  AUDIT_QUESTIONS,
  COMPARISON_INSTRUCTIONS,
  REVIEW_LIMITS,
} from "@/lib/review-form";

export type PairAuditProps = {
  assignmentId: string;
  intendedDifference: string;
  intentLabel: string;
  intentHelp: string;
  source: ViewContent | null;
  target: ViewContent | null;
  anchorConversationId: string | null;
};

type AuditDraft = {
  topicTaskMatch: string;
  scopeSimilarity: string;
  mainDifference: string;
  auditNote: string;
};
const EMPTY: AuditDraft = {
  topicTaskMatch: "",
  scopeSimilarity: "",
  mainDifference: "",
  auditNote: "",
};

/**
 * Two related versions side by side, and how well they can be compared
 * (form D). The auditor is told what the author set out to explore and
 * nothing else: not the reviews either version received, not who wrote
 * them.
 */
export default function PairAuditWorkspace({
  assignmentId,
  intendedDifference,
  intentLabel,
  intentHelp,
  source,
  target,
  anchorConversationId,
}: PairAuditProps) {
  const key = `astral.audit.${assignmentId}`;
  const [draft, setDraft] = useState<AuditDraft>(() => readDraft(key, EMPTY));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"form" | "skip" | "done" | "skipped">("form");
  const [pending, start] = useTransition();
  const clipboard = useClipboardLog(anchorConversationId ?? "");
  useStillHere(assignmentId, mode === "form" || mode === "skip");

  useEffect(() => {
    if (mode === "form" || mode === "skip") writeDraft(key, draft);
  }, [key, draft, mode]);

  const set = (patch: Partial<AuditDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const field of Object.keys(patch)) delete next[field];
      return next;
    });
  };

  function submit() {
    setMessage(null);
    start(async () => {
      const result = await submitAuditAction(assignmentId, draft);
      if (result.ok) {
        clearDraft(key);
        return setMode("done");
      }
      setMessage(result.message);
      setErrors(result.errors ?? {});
    });
  }

  return (
    <div className="flex h-full" {...(anchorConversationId ? clipboard : {})}>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Compare two related versions</span>
            {(mode === "form" || mode === "skip") && (
              <Link href="/review" className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">
                Pause
              </Link>
            )}
          </div>
        </header>
        {/* What the author said, set apart from everything else on the
            screen: it is the thing the two versions are being held up to. */}
        <section
          aria-label="What the author set out to explore"
          className="border-b border-accent/40 bg-accent/10 px-4 py-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            What the author set out to explore
          </p>
          <p className="mt-1 font-serif text-xl leading-snug">{intentLabel}</p>
          {intentHelp && <p className="text-sm text-muted-foreground">{intentHelp}</p>}
          {intendedDifference && (
            <p className="mt-1.5 text-sm">
              <span className="text-muted-foreground">In their words: </span>
              <span className="font-medium">{intendedDifference}</span>
            </p>
          )}
        </section>
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
          {[
            { name: "Version 1 (original)", content: source },
            { name: "Version 2 (related version)", content: target },
          ].map((side) => (
            <section key={side.name} aria-label={side.name} className="flex min-h-0 flex-col">
              <h2 className="border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {side.name}
              </h2>
              <div className="relative flex-1 overflow-y-auto">
                {side.content ? (
                  <ReviewTranscript content={side.content} />
                ) : (
                  <p className="p-4 text-sm italic text-muted-foreground">Nothing to show.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <aside
        data-clip="review"
        aria-label="Comparison form"
        className="relative flex w-[24rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-muted/20"
      >
        {mode === "done" && (
          <ReviewFinished
            heading="Comparison recorded"
            detail="Thank you. Your answer is final and has been saved."
            purpose="pair_audit"
          />
        )}
        {mode === "skipped" && (
          <ReviewFinished
            heading="Skipped"
            detail="Noted, with your reason. Nothing else was recorded for this pair."
            purpose="pair_audit"
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
            <details className="rounded-[var(--radius)] border border-border bg-card px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">Comparison instructions</summary>
              <div className="markdown mt-2 text-sm leading-relaxed">
                <ReactMarkdown>{COMPARISON_INSTRUCTIONS}</ReactMarkdown>
              </div>
            </details>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You are judging how these two compare, not which one is more
              concerning and not whether they should get different answers.
            </p>

            {AUDIT_QUESTIONS.map((q) => (
              <Question key={q.key} id={q.key} text={q.question} error={errors[q.key]}>
                <Radios
                  name={q.key}
                  legend={q.question}
                  value={draft[q.key]}
                  options={q.options}
                  onChange={(value) => set({ [q.key]: value })}
                />
              </Question>
            ))}

            <Question id="auditNote" text={AUDIT_NOTE_QUESTION} error={errors.auditNote}>
              <Textarea
                aria-label={AUDIT_NOTE_QUESTION}
                value={draft.auditNote}
                maxLength={REVIEW_LIMITS.auditNote}
                onChange={(e) => set({ auditNote: e.target.value })}
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
                {pending ? "Submitting..." : "Submit comparison"}
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
