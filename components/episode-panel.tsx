"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Folder, GitCompareArrows, Plus } from "lucide-react";
import {
  reviseRelatedAction,
  saveDetailsAction,
  saveLabelsAction,
  saveSessionLabelsAction,
  submitEpisodeAction,
  submitSessionAction,
} from "@/app/chat/episode-actions";
import { Radios } from "@/components/intake-fields";
import { Input } from "@/components/ui/input";
import {
  AUTHOR_ROLES,
  EXPECT_CONFIDENCE,
  EXPECT_REFERRAL,
  QUESTIONS,
  SCENARIOS,
  TASK_KINDS,
  TASK_OTHER_LIMIT,
  labelOf,
  missingLabels,
  type AuthorLabels,
} from "@/lib/author-labels";
import { useConversationStore } from "@/components/conversation-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPARISON_INTENTS,
  RELATED_QUESTIONS,
  LIMITS,
  comparisonIntentLabel,
} from "@/lib/episode-options";
import { formatEventDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Linked = {
  title: string;
  sessionId: string | null;
  submitted: boolean;
} | null;

export type EpisodeInfo = {
  id: string;
  title: string;
  isFolder: boolean;
  /** The work as a whole: the conversation, or the folder. */
  status: "draft" | "submitted";
  submittedAt: string | null;
  /**
   * The conversation on screen by itself. In a folder it can be
   * submitted, and so closed, before the folder is.
   */
  sessionStatus: "draft" | "submitted";
  sessionSubmittedAt: string | null;
  goal: string;
  /**
   * The author's answers, as far as they have got. For a conversation that
   * stands alone they are about the work. For a session in a folder they
   * are about that session, and `goal` above is too.
   */
  labels: AuthorLabels;
  comparisonOpen: boolean;
  sessions: {
    id: string;
    order: number;
    title: string;
    userMessages: number;
    submitted: boolean;
  }[];
  /** Related versions link single conversations: this one, not its folder. */
  madeFrom: { intent: string; difference: string; other: Linked } | null;
  versions: { intent: string; difference: string; other: Linked }[];
};

/** What is being confirmed: this conversation, or the whole folder. */
type Confirming = null | "conversation" | "conversation-then-related" | "folder";

/**
 * Everything about a piece of work that is not the chat itself.
 *
 * While the conversation is a draft: the author's answers about what they
 * are doing and what they expect a reviewer to decide, and submitting it.
 * In a folder a conversation can be submitted by itself, which closes it
 * and leaves the folder open; the folder is submitted as a whole when it
 * is finished. Once submitted: that it is, the answers as given, and a
 * way to make a related version of this conversation. None of what is
 * written here is sent to the assistant or shown to a reviewer.
 */
export function EpisodePanel({
  episode,
  currentSessionId,
  currentHasMessages,
  busy,
}: {
  episode: EpisodeInfo;
  currentSessionId: string;
  /** Whether the session on screen has anything in it yet, as of now. */
  currentHasMessages: boolean;
  /** A reply is being written in the session on screen. */
  busy: boolean;
}) {
  const router = useRouter();
  const store = useConversationStore();
  const [pending, start] = useTransition();
  const folderSubmitted = episode.status === "submitted";
  // This conversation is closed: nothing in it or about it can change.
  const submitted = folderSubmitted || episode.sessionStatus === "submitted";
  const submittedAt = episode.sessionSubmittedAt ?? episode.submittedAt;

  const [goal, setGoal] = useState(episode.goal);
  const [savedGoal, setSavedGoal] = useState(episode.goal);
  const [goalNote, setGoalNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | null>(null);
  // What a related version set out to explore, which its author may put
  // differently until it is submitted.
  const [intent, setIntent] = useState(episode.madeFrom?.intent ?? "");
  const [difference, setDifference] = useState(episode.madeFrom?.difference ?? "");
  const [savedIntent, setSavedIntent] = useState({ intent, difference });
  const [intentNote, setIntentNote] = useState<string | null>(null);
  const intentChanged = intent !== savedIntent.intent || difference !== savedIntent.difference;

  function saveIntent() {
    setIntentNote(null);
    start(async () => {
      const result = await reviseRelatedAction(currentSessionId, {
        intent,
        intendedDifference: difference,
      });
      if (!result.ok) return setIntentNote(result.message);
      setSavedIntent({ intent, difference: difference.trim() });
      setDifference(difference.trim());
      setIntentNote("Saved.");
    });
  }

  const [labels, setLabels] = useState<AuthorLabels>(episode.labels);
  // Shown once someone has tried to submit, not while they are still
  // working their way down the panel.
  const [labelErrors, setLabelErrors] = useState<Partial<Record<keyof AuthorLabels, string>>>({});

  // A session in a folder keeps its answers on the session, with its goal
  // beside them. A conversation that stands alone keeps them on the work.
  const perSession = episode.isFolder;
  const saveAnswers = (next: AuthorLabels, extra?: { goal?: string }) =>
    perSession
      ? saveSessionLabelsAction(currentSessionId, { ...next, goal: extra?.goal ?? goal })
      : saveLabelsAction(episode.id, next);

  /** Takes an answer, and saves it without making anyone wait. */
  function answer(patch: Partial<AuthorLabels>, save = true) {
    const next = { ...labels, ...patch };
    setLabels(next);
    setLabelErrors((e) => {
      const rest = { ...e };
      for (const key of Object.keys(patch) as (keyof AuthorLabels)[]) delete rest[key];
      if ("taskKinds" in patch) delete rest.taskOther;
      return rest;
    });
    if (save) void saveAnswers(next);
  }

  // What submitting the folder would take in: sessions with at least one
  // message from the participant. The one on screen is judged by what is
  // on screen.
  const included = episode.sessions.filter((s) =>
    s.id === currentSessionId ? currentHasMessages : s.userMessages > 0,
  );
  const empty = episode.sessions.length - included.length;
  const alreadyIn = included.filter((s) => s.submitted && s.id !== currentSessionId).length +
    (submitted && currentHasMessages ? 1 : 0);

  /** Opens the confirmation, unless a question is still unanswered. */
  function attempt(kind: Exclude<Confirming, null>) {
    // The questions on screen are this conversation's. They have to be
    // answered when it is what is going in: by itself, or as a part of
    // the folder that has anything in it.
    const answersNeeded = !submitted && (kind !== "folder" || currentHasMessages);
    const missing = answersNeeded ? missingLabels(labels) : {};
    const first = Object.keys(missing)[0];
    if (first) {
      setLabelErrors(missing);
      setError("Answer the marked questions above first. They are required to submit.");
      document
        .querySelector(`[data-label-question="${first === "taskOther" ? "taskKinds" : first}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setError(null);
    setConfirming(kind);
  }

  function saveGoal() {
    setGoalNote(null);
    start(async () => {
      const result = perSession
        ? await saveAnswers(labels, { goal })
        : await saveDetailsAction(episode.id, { goal: goal.trim() || null });
      if (!result.ok) return setGoalNote(result.message);
      setSavedGoal(goal);
      setGoalNote("Saved.");
    });
  }

  function submit(kind: Exclude<Confirming, null>) {
    setError(null);
    const stop = (message: string) => {
      setConfirming(null);
      setError(message);
    };
    start(async () => {
      if (!submitted) {
        // An unsaved goal note goes in with the submission it belongs to.
        if (goal !== savedGoal && !perSession) {
          const saved = await saveDetailsAction(episode.id, { goal: goal.trim() || null });
          if (!saved.ok) return stop(saved.message);
          setSavedGoal(goal);
        }
        // A reworded aim that was not saved goes in with the submission.
        if (episode.madeFrom && intentChanged) {
          const revised = await reviseRelatedAction(currentSessionId, {
            intent,
            intendedDifference: difference,
          });
          if (!revised.ok) return stop(revised.message);
        }
        // The answers as they stand now, in case the last one is still on
        // its way.
        const labelled = await saveAnswers(labels);
        if (!labelled.ok) return stop(labelled.message);
      }

      if (kind === "folder") {
        const result = await submitEpisodeAction(episode.id);
        if (!result.ok) return stop(result.message);
        store.patchEpisode(episode.id, { episodeStatus: "submitted" });
      } else {
        const result = await submitSessionAction(currentSessionId);
        if (!result.ok) return stop(result.message);
        store.patchConversation(currentSessionId, { status: "submitted" });
        if (result.episodeSubmitted) store.patchEpisode(episode.id, { episodeStatus: "submitted" });
      }
      setConfirming(null);
      if (kind === "conversation-then-related") router.push(`/chat/related/${currentSessionId}`);
      else router.refresh();
    });
  }

  const canSubmitThis = !submitted && currentHasMessages;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {episode.isFolder && <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {episode.isFolder ? episode.title : "This conversation"}
        </h2>
        {episode.isFolder && (
          <Link href={`/chat/folder/${episode.id}`} className="shrink-0 text-xs text-accent underline">
            Folder details
          </Link>
        )}
      </div>

      <div className="relative flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {submitted && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-[var(--radius)] border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              Submitted
              {submittedAt ? ` ${formatEventDateTime(submittedAt)}` : ""}. It is now fixed:
              nothing in it can be changed.
              {episode.isFolder && !folderSubmitted && (
                <> The folder is still open, and is submitted separately.</>
              )}
            </span>
          </p>
        )}

        {/* A submitted single conversation has no sessions to list and
            none to add, so the heading would stand over nothing. */}
        {(episode.isFolder || !submitted) && (
          <Block
            title={episode.isFolder ? `Sessions (${episode.sessions.length})` : "Sessions"}
            note={
              folderSubmitted
                ? undefined
                : "Each session is a fresh conversation. It does not see the others, or your notes."
            }
          >
            {episode.isFolder && (
              <ul className="space-y-0.5">
                {episode.sessions.map((s) => {
                  const here = s.id === currentSessionId;
                  const done = here ? submitted : s.submitted || folderSubmitted;
                  const hasWork = here ? currentHasMessages : s.userMessages > 0;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/chat/${s.id}`}
                        aria-current={here ? "page" : undefined}
                        className={cn(
                          "block truncate rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-muted",
                          here && "bg-muted font-medium",
                        )}
                      >
                        {s.order}. {s.title === "New conversation" ? `Session ${s.order}` : s.title}
                        <span className="font-normal text-muted-foreground">
                          {!hasWork ? " · empty" : done ? " · submitted" : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {!folderSubmitted && (
              <Link href={`/chat?to=${episode.id}`} className="inline-block">
                <Button variant="outline" size="sm" disabled={pending}>
                  <Plus className="h-3.5 w-3.5" />
                  {episode.isFolder ? "New session" : "Add a session (makes this a folder)"}
                </Button>
              </Link>
            )}
          </Block>
        )}

        {episode.madeFrom && (
          <Block title="A related version">
            <p className="text-sm">
              Made from{" "}
              {episode.madeFrom.other?.sessionId ? (
                <Link
                  href={`/chat/${episode.madeFrom.other.sessionId}`}
                  className="font-medium text-accent underline"
                >
                  {episode.madeFrom.other.title}
                </Link>
              ) : (
                "an earlier conversation"
              )}
              , as a fresh conversation. None of its messages came with it.
            </p>
            {submitted ? (
              <p className="text-xs text-muted-foreground">
                {comparisonIntentLabel(intent)}
                {difference && (
                  <>
                    : <span className="text-foreground">{difference}</span>
                  </>
                )}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">{RELATED_QUESTIONS.intent}</p>
                  <Radios
                    name="related-intent"
                    legend={RELATED_QUESTIONS.intent}
                    value={intent}
                    options={[...COMPARISON_INTENTS]}
                    onChange={(value) => {
                      setIntent(value);
                      setIntentNote(null);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="related-difference" className="text-sm font-medium">
                    {RELATED_QUESTIONS.difference}
                  </label>
                  <Textarea
                    id="related-difference"
                    rows={3}
                    maxLength={LIMITS.intendedDifference}
                    value={difference}
                    onChange={(e) => {
                      setDifference(e.target.value);
                      setIntentNote(null);
                    }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || !intentChanged}
                    onClick={saveIntent}
                  >
                    Save change
                  </Button>
                  {intentNote && (
                    <span role="status" className="text-xs text-muted-foreground">
                      {intentNote}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  You can revise this until you submit. A reviewer comparing the two versions is
                  shown it; nothing else you write here.
                </p>
              </div>
            )}
          </Block>
        )}

        {/* The author's questions, one after another. The scenario comes
            first. */}
        {submitted ? (
          <dl className="space-y-2 text-sm">
            <Answered q="Scenario">{labelOf(SCENARIOS, labels.scenario)}</Answered>
            <Answered q="Role">{labelOf(AUTHOR_ROLES, labels.role)}</Answered>
            <Answered q="Kind of task">
              {labels.taskKinds
                .map((k) => (k === "other" && labels.taskOther ? labels.taskOther : labelOf(TASK_KINDS, k)))
                .join("; ")}
            </Answered>
            <Answered q="Specific goal">{episode.goal}</Answered>
            <Answered q="Expected a reviewer to recommend specialist review">
              {labelOf(EXPECT_REFERRAL, labels.expectReferral)}
            </Answered>
            <Answered q="Confidence in that">
              {labelOf(EXPECT_CONFIDENCE, labels.expectConfidence)}
            </Answered>
          </dl>
        ) : (
          <div className="space-y-5">
            <LabelQuestion id="scenario" text={QUESTIONS.scenario} error={labelErrors.scenario}>
              <Radios
                name="label-scenario"
                legend={QUESTIONS.scenario}
                value={labels.scenario}
                options={SCENARIOS}
                onChange={(scenario) => answer({ scenario })}
              />
            </LabelQuestion>

            <LabelQuestion id="role" text={QUESTIONS.role} error={labelErrors.role}>
              <Radios
                name="label-role"
                legend={QUESTIONS.role}
                value={labels.role}
                options={AUTHOR_ROLES}
                onChange={(role) => answer({ role })}
              />
            </LabelQuestion>

            <LabelQuestion
              id="taskKinds"
              text={QUESTIONS.taskKinds}
              hint="Tick all that apply."
              error={labelErrors.taskKinds ?? labelErrors.taskOther}
            >
              <fieldset>
                <legend className="sr-only">{QUESTIONS.taskKinds}</legend>
                <div className="space-y-1.5">
                  {TASK_KINDS.map((kind) => (
                    <label key={kind.value} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0"
                        checked={labels.taskKinds.includes(kind.value)}
                        onChange={(e) =>
                          answer({
                            taskKinds: e.target.checked
                              ? [...labels.taskKinds, kind.value]
                              : labels.taskKinds.filter((k) => k !== kind.value),
                          })
                        }
                      />
                      {kind.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {labels.taskKinds.includes("other") && (
                <Input
                  aria-label="Other kind of task: say what"
                  placeholder="Say what"
                  maxLength={TASK_OTHER_LIMIT}
                  value={labels.taskOther}
                  onChange={(e) => answer({ taskOther: e.target.value }, false)}
                  onBlur={() => void saveAnswers(labels)}
                />
              )}
            </LabelQuestion>

            <LabelQuestion id="goal" text={QUESTIONS.goal}>
              <Textarea
                aria-label="Goal or notes"
                rows={3}
                maxLength={LIMITS.goal}
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value);
                  setGoalNote(null);
                }}
              />
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || goal === savedGoal}
                  onClick={saveGoal}
                >
                  Save note
                </Button>
                {goalNote && <span className="text-xs text-muted-foreground">{goalNote}</span>}
              </div>
            </LabelQuestion>

            <LabelQuestion
              id="expectReferral"
              text={QUESTIONS.expectReferral}
              error={labelErrors.expectReferral}
            >
              <Radios
                name="label-expect-referral"
                legend={QUESTIONS.expectReferral}
                value={labels.expectReferral}
                options={EXPECT_REFERRAL}
                onChange={(expectReferral) => answer({ expectReferral })}
              />
            </LabelQuestion>

            <LabelQuestion
              id="expectConfidence"
              text={QUESTIONS.expectConfidence}
              error={labelErrors.expectConfidence}
            >
              <Radios
                name="label-expect-confidence"
                legend={QUESTIONS.expectConfidence}
                value={labels.expectConfidence}
                options={EXPECT_CONFIDENCE}
                onChange={(expectConfidence) => answer({ expectConfidence })}
              />
            </LabelQuestion>
          </div>
        )}

        {episode.versions.length > 0 && (
          <Block title={`Related versions made from this (${episode.versions.length})`}>
            <ul className="space-y-1.5">
              {episode.versions.map((v, i) => (
                <li key={i} className="text-sm">
                  {v.other?.sessionId ? (
                    <Link href={`/chat/${v.other.sessionId}`} className="text-accent underline">
                      {v.other.title}
                    </Link>
                  ) : (
                    "A related version"
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    · {v.other?.submitted ? "submitted" : "not submitted yet"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {comparisonIntentLabel(v.intent)}
                    {v.difference ? `: ${v.difference}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {error && <p className="text-xs text-danger">{error}</p>}

        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Submit this {confirming === "folder" ? "folder" : "conversation"}?
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              It will be fixed as it is now and cannot be changed or continued afterwards.{" "}
              {confirming === "folder" ? (
                <>
                  {included.length === 1
                    ? "One session is in it"
                    : `${included.length} sessions are in it`}
                  : {included.map((s) => s.order).join(", ")}.
                  {alreadyIn > 0 && ` ${alreadyIn} already submitted by ${alreadyIn === 1 ? "itself" : "themselves"}.`}
                  {empty > 0 && ` ${empty} empty session${empty === 1 ? " is" : "s are"} left out.`}
                </>
              ) : episode.isFolder ? (
                "Only this conversation is submitted. The rest of the folder stays open, and the folder is still to be submitted as a whole."
              ) : (
                "One session will be submitted."
              )}
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={pending} onClick={() => submit(confirming)}>
                {pending
                  ? "Submitting..."
                  : confirming === "conversation-then-related"
                    ? "Submit and continue"
                    : "Yes, submit"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {!submitted && !currentHasMessages && (
              <p className="text-xs text-muted-foreground">
                Send a message first, then submit at a natural stopping point. Refusals and
                unfinished conversations are still useful.
              </p>
            )}
            {busy && (
              <p className="text-xs text-muted-foreground">
                A reply is being written. It can be submitted once that has finished.
              </p>
            )}
            {!submitted && (
              <Button
                className="w-full"
                disabled={pending || busy || !canSubmitThis}
                onClick={() => attempt("conversation")}
              >
                Submit conversation
              </Button>
            )}
            {!submitted && episode.comparisonOpen && (
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || busy || !canSubmitThis}
                onClick={() => attempt("conversation-then-related")}
              >
                <GitCompareArrows className="h-4 w-4" />
                Submit source and create related version
              </Button>
            )}
            {submitted && episode.comparisonOpen && (
              <Link href={`/chat/related/${currentSessionId}`} className="block">
                <Button className="w-full" variant={episode.isFolder && !folderSubmitted ? "outline" : "default"}>
                  <GitCompareArrows className="h-4 w-4" />
                  Create related version
                </Button>
              </Link>
            )}
            {episode.isFolder && !folderSubmitted && (
              <div className="space-y-1.5 border-t border-border pt-2">
                <Button
                  className="w-full"
                  disabled={pending || busy || included.length === 0}
                  onClick={() => attempt("folder")}
                >
                  <Folder className="h-4 w-4" />
                  Submit folder
                </Button>
                <p className="text-xs text-muted-foreground">
                  Submits every session with something in it, and closes the folder.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** One of the author's questions: its words, and a complaint if unanswered. */
function LabelQuestion({
  id,
  text,
  hint,
  error,
  children,
}: {
  id: string;
  text: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-label-question={id} className="space-y-2">
      <div>
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            error && "text-danger",
          )}
        >
          {text}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** An answer as it was given, once the work is submitted. */
function Answered({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{q}</dt>
      <dd className="whitespace-pre-wrap">
        {children || (
          <span className="text-muted-foreground">None recorded.</span>
        )}
      </dd>
    </div>
  );
}
