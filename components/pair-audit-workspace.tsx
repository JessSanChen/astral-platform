"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitAuditAction } from "@/app/review/actions";
import { useClipboardLog } from "@/components/clipboard-log";
import ReactMarkdown from "react-markdown";
import { Radios } from "@/components/intake-fields";
import {
  Question,
  clearDraft,
  readDraft,
  useNextRecord,
  useStillHere,
  writeDraft,
} from "@/components/review-shared";
import { ReviewSkip } from "@/components/review-skip";
import { ReviewTranscript } from "@/components/review-transcript";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ViewContent } from "@/lib/episodes";
import { formatEventDateTime } from "@/lib/time";
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
  /**
   * Set when this comparison was already submitted and is being looked
   * at again: the answers as they stand, which can be changed.
   */
  submitted?: { at: string; revisedAt: string | null; answers: AuditDraft } | null;
};

export type AuditDraft = {
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
 *
 * Laid out as the transcript review is: the way to skip first, the
 * instructions folded away under it, then the questions. Submitting goes
 * straight on to the next pair, and a submitted comparison can be opened
 * again and changed, with the version it replaces kept.
 */
export default function PairAuditWorkspace({
  assignmentId,
  intendedDifference,
  intentLabel,
  intentHelp,
  source,
  target,
  anchorConversationId,
  submitted = null,
}: PairAuditProps) {
  const key = `astral.audit.${assignmentId}`;
  // Decided once, when the screen opens. Submitting here makes the record
  // a finished one, and the page may be told so while this is still on
  // screen; that must not turn the form just submitted into a revisit.
  const [revisiting] = useState(Boolean(submitted));
  const [draft, setDraft] = useState<AuditDraft>(() =>
    submitted ? submitted.answers : readDraft(key, EMPTY),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [mode, setMode] = useState<"form" | "skip">("form");
  const [pending, start] = useTransition();
  const router = useRouter();
  const next = useNextRecord("pair_audit");
  const clipboard = useClipboardLog(anchorConversationId ?? "");
  const working = !revisiting;
  useStillHere(assignmentId, working);

  useEffect(() => {
    if (working) writeDraft(key, draft);
  }, [key, draft, working]);

  const set = (patch: Partial<AuditDraft>) => {
    setSaved(null);
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
      if (!result.ok) {
        setMessage(result.message);
        return setErrors(result.errors ?? {});
      }
      if (revisiting) {
        setSaved(result.revised ? "Updated. The earlier version is kept." : "Nothing was changed.");
        return router.refresh();
      }
      clearDraft(key);
      // Straight on to the next one, or back to Review if there is none.
      await next("recorded");
    });
  }

  function skipped() {
    clearDraft(key);
    start(() => next("skipped"));
  }

  return (
    <div className="flex h-full" {...(anchorConversationId ? clipboard : {})}>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Compare two related versions</span>
            {working && (
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
        className="relative flex w-[27rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-muted/20"
      >
        {mode === "skip" && (
          <ReviewSkip
            assignmentId={assignmentId}
            onCancel={() => setMode("form")}
            onSkipped={skipped}
          />
        )}
        {mode === "form" && (
          <div className="space-y-6 p-4">
            {revisiting ? (
              <p
                role="status"
                className="rounded-[var(--radius)] border border-accent/40 bg-accent/5 px-3 py-2.5 text-sm leading-snug"
              >
                You submitted this comparison {formatEventDateTime(submitted!.at)}
                {submitted!.revisedAt && `, and last changed it ${formatEventDateTime(submitted!.revisedAt)}`}.
                You can change your answers. Each earlier version is kept.
              </p>
            ) : (
              /* First thing on the form, as on a transcript review. */
              <div className="flex items-center gap-3 rounded-[var(--radius)] border border-accent/40 bg-accent/5 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-sm leading-snug">
                  Outside your expertise, or a pair you recognize? Skip it. A skip is never
                  counted against you.
                </p>
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={pending}
                  onClick={() => setMode("skip")}
                >
                  Skip this one
                </Button>
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              You are judging how these two compare, not which one is more
              concerning and not whether they should get different answers.
            </p>
            <details className="rounded-[var(--radius)] border border-border bg-card px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">Comparison instructions</summary>
              <div className="markdown mt-2 text-sm leading-relaxed">
                <ReactMarkdown>{COMPARISON_INSTRUCTIONS}</ReactMarkdown>
              </div>
            </details>

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

            {saved && (
              <p role="status" className="rounded-[var(--radius)] bg-muted px-3 py-2 text-sm">
                {saved}
              </p>
            )}

            {revisiting ? (
              <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                <Link href="/review">
                  <Button variant="outline">Back to Review</Button>
                </Link>
                <Button disabled={pending} onClick={submit}>
                  {pending ? "Saving..." : "Update comparison"}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                  <Button variant="outline" disabled={pending} onClick={() => setMode("skip")}>
                    Skip
                  </Button>
                  <Button disabled={pending} onClick={submit}>
                    {pending ? "Submitting..." : "Submit comparison"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your answers are kept in this browser until you submit. Submitting takes you
                  straight to the next pair. You can open a submitted comparison again from the
                  list on the left.
                </p>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
