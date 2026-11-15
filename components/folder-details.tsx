"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Folder, Plus } from "lucide-react";
import {
  saveDetailsAction,
  saveLabelsAction,
  submitEpisodeAction,
} from "@/app/chat/episode-actions";
import { useConversationStore } from "@/components/conversation-store";
import { Asked, RoleAndTask } from "@/components/label-fields";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTHOR_ROLES,
  FOLDER_QUESTIONS,
  TASK_KINDS,
  labelOf,
  missingFolderLabels,
  type FolderLabels,
} from "@/lib/author-labels";
import { LIMITS } from "@/lib/episode-options";

type Session = {
  id: string;
  order: number;
  title: string;
  model: string;
  started: boolean;
  answered: boolean;
  /** Submitted by itself, ahead of the folder. */
  submitted: boolean;
};

/**
 * What a folder is asked as a whole, its sessions, and submitting it.
 *
 * Only the little that holds across the sessions is asked here: the
 * underlying role, the underlying kind of task, and an optional goal. A
 * session starts from these answers and keeps its own, so changing them
 * here does not rewrite what a session already says.
 *
 * A session can be submitted by itself from its own page. The folder is
 * submitted here or from any of its sessions: that takes in every session
 * with something in it and closes the folder.
 */
export function FolderDetails({
  episodeId,
  title,
  submitted,
  labels: stored,
  goal: storedGoal,
  sessions,
}: {
  episodeId: string;
  title: string;
  submitted: boolean;
  labels: FolderLabels;
  goal: string;
  sessions: Session[];
}) {
  const router = useRouter();
  const store = useConversationStore();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [labels, setLabels] = useState<FolderLabels>(stored);
  const [goal, setGoal] = useState(storedGoal);
  const [savedGoal, setSavedGoal] = useState(storedGoal);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const missing = missingFolderLabels(labels);
  const withWork = sessions.filter((s) => s.started);
  const unanswered = withWork.filter((s) => !s.answered && !s.submitted);
  const blocked =
    withWork.length === 0
      ? "Send a message in one of its sessions first."
      : Object.keys(missing).length > 0
        ? "Answer the folder's questions above first."
        : unanswered.length > 0
          ? `${unanswered.length === 1 ? `Session ${unanswered[0].order} still has` : `Sessions ${unanswered.map((s) => s.order).join(", ")} still have`} questions to answer. Open ${unanswered.length === 1 ? "it" : "each"} and answer them.`
          : null;

  function submitFolder() {
    setSubmitError(null);
    start(async () => {
      const result = await submitEpisodeAction(episodeId);
      setConfirming(false);
      if (!result.ok) return setSubmitError(result.message);
      store.patchEpisode(episodeId, { episodeStatus: "submitted" });
      router.refresh();
    });
  }

  function save(next: FolderLabels) {
    setNote(null);
    start(async () => {
      const result = await saveLabelsAction(episodeId, next);
      setNote(result.ok ? { text: "Saved.", bad: false } : { text: result.message, bad: true });
    });
  }

  function change(patch: Partial<FolderLabels>) {
    const next = { ...labels, ...patch };
    setLabels(next);
    // Free text is saved when it is left; a tick or a choice at once.
    if (!("taskOther" in patch)) save(next);
  }

  function saveGoal() {
    setNote(null);
    start(async () => {
      const result = await saveDetailsAction(episodeId, { goal: goal.trim() || null });
      if (!result.ok) return setNote({ text: result.message, bad: true });
      setSavedGoal(goal);
      setNote({ text: "Saved.", bad: false });
    });
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 font-serif text-3xl font-medium tracking-tight">
            <Folder className="h-6 w-6 text-muted-foreground" />
            {title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {submitted
              ? "Submitted. Nothing in it can be changed."
              : "Each session starts from these answers and has its own, in the panel beside its chat."}
          </p>
        </div>

        <section className="space-y-5 rounded-[var(--radius)] border border-border bg-card px-4 py-4">
          <div>
            <h2 className="font-serif text-lg font-medium">About the folder</h2>
            <p className="text-xs text-muted-foreground">
              {submitted
                ? "Author-only. Not sent to the assistant, not shown to reviewers."
                : "Required to submit. Not sent to the assistant, not shown to reviewers."}
            </p>
          </div>
          {submitted ? (
            <dl className="space-y-3 text-sm">
              <Answered q="Underlying role">{labelOf(AUTHOR_ROLES, labels.role)}</Answered>
              <Answered q="Underlying kind of task">
                {labels.taskKinds
                  .map((k) => (k === "other" && labels.taskOther ? labels.taskOther : labelOf(TASK_KINDS, k)))
                  .join("; ")}
              </Answered>
              <Answered q="Goal across the sessions">{storedGoal}</Answered>
            </dl>
          ) : (
            <>
              <RoleAndTask
                labels={labels}
                roleText={FOLDER_QUESTIONS.role}
                taskText={FOLDER_QUESTIONS.taskKinds}
                onChange={change}
                onOtherBlur={() => save(labels)}
              />
              <Asked id="goal" text={FOLDER_QUESTIONS.goal}>
                <Textarea
                  aria-label={FOLDER_QUESTIONS.goal}
                  rows={3}
                  maxLength={LIMITS.goal}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || goal === savedGoal}
                  onClick={saveGoal}
                >
                  Save goal
                </Button>
              </Asked>
              {Object.keys(missing).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Still to answer here before the folder can be submitted:{" "}
                  {[missing.role && "the role", (missing.taskKinds || missing.taskOther) && "the kind of task"]
                    .filter(Boolean)
                    .join(" and ")}
                  .
                </p>
              )}
              {note && (
                <p role="status" className={note.bad ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
                  {note.text}
                </p>
              )}
            </>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-medium">Sessions ({sessions.length})</h2>
            {!submitted && (
              <Link href={`/chat?to=${episodeId}`}>
                <Button variant="outline" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  New session
                </Button>
              </Link>
            )}
          </div>
          <ul className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/chat/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {s.order}. {s.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">{s.model}</span>
                  </span>
                  {s.submitted || (submitted && s.started) ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Submitted
                    </span>
                  ) : submitted ? null : s.answered ? (
                    <span className="shrink-0 text-xs text-muted-foreground">Questions answered</span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.started ? "Questions to answer" : "Empty"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {!submitted && (
          <section
            aria-label="Submit folder"
            className="space-y-3 rounded-[var(--radius)] border border-border bg-card px-4 py-4"
          >
            <div>
              <h2 className="font-serif text-lg font-medium">Submit the folder</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Submits every session with something in it, read together as one piece of work,
                and closes the folder. A session can also be submitted by itself from its own
                page; the folder is still submitted here when it is finished.
              </p>
            </div>
            {blocked && <p className="text-sm text-muted-foreground">{blocked}</p>}
            {submitError && (
              <p role="alert" className="text-sm text-danger">
                {submitError}
              </p>
            )}
            {confirming ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Submit this folder?</p>
                <p className="text-xs text-muted-foreground">
                  It will be fixed as it is now and cannot be changed or continued afterwards.{" "}
                  {withWork.length === 1 ? "One session is in it" : `${withWork.length} sessions are in it`}:{" "}
                  {withWork.map((s) => s.order).join(", ")}.
                </p>
                <div className="flex gap-2">
                  <Button disabled={pending} onClick={submitFolder}>
                    {pending ? "Submitting..." : "Yes, submit"}
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button disabled={pending || Boolean(blocked)} onClick={() => setConfirming(true)}>
                <Folder className="h-4 w-4" />
                Submit folder
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Answered({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{q}</dt>
      <dd className="whitespace-pre-wrap">
        {children || <span className="text-muted-foreground">None recorded.</span>}
      </dd>
    </div>
  );
}
