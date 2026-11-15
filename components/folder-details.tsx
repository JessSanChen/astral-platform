"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Folder, Plus } from "lucide-react";
import { saveDetailsAction, saveLabelsAction } from "@/app/chat/episode-actions";
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
};

/**
 * What a folder is asked as a whole, and its sessions.
 *
 * Only the little that holds across the sessions is asked here: the
 * underlying role, the underlying kind of task, and an optional goal. A
 * session starts from these answers and keeps its own, so changing them
 * here does not rewrite what a session already says.
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
  const [pending, start] = useTransition();
  const [labels, setLabels] = useState<FolderLabels>(stored);
  const [goal, setGoal] = useState(storedGoal);
  const [savedGoal, setSavedGoal] = useState(storedGoal);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const missing = missingFolderLabels(labels);
  const unanswered = sessions.filter((s) => s.started && !s.answered);

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
              : "What holds across this folder's sessions. Each session starts from these answers and has its own, in the panel beside its chat."}
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
                  {!submitted &&
                    (s.answered ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Questions answered
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {s.started ? "Questions to answer" : "Empty"}
                      </span>
                    ))}
                </Link>
              </li>
            ))}
          </ul>
          {!submitted && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              To submit the folder, open any of its sessions and use Submit folder in the panel
              beside the chat.
              {unanswered.length > 0 &&
                ` ${unanswered.length === 1 ? "One session still has" : `${unanswered.length} sessions still have`} questions to answer first.`}
            </p>
          )}
        </section>
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
