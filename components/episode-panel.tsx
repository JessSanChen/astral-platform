"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Folder,
  GitCompareArrows,
  PanelRightClose,
  Plus,
  Trophy,
} from "lucide-react";
import {
  addSessionAction,
  saveDetailsAction,
  setPrizeEntryAction,
  submitEpisodeAction,
} from "@/app/chat/episode-actions";
import { useConversationStore } from "@/components/conversation-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  LIMITS,
  MAX_PRIZE_ENTRIES,
  PROVENANCE,
  comparisonIntentLabel,
  provenanceLabel,
} from "@/lib/episode-options";
import { formatEventDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Linked = { title: string; sessionId: string | null; submitted: boolean } | null;

export type EpisodeInfo = {
  id: string;
  title: string;
  isFolder: boolean;
  status: "draft" | "submitted";
  submittedAt: string | null;
  provenance: string | null;
  goal: string;
  /** Made with Create related version. */
  related: boolean;
  prizeEntered: boolean;
  /** Separate pieces of work this person has entered so far. */
  prizeEntriesUsed: number;
  prizeClosed: boolean;
  comparisonOpen: boolean;
  sessions: { id: string; order: number; title: string; userMessages: number }[];
  madeFrom: { intent: string; difference: string; other: Linked } | null;
  versions: { intent: string; difference: string; other: Linked }[];
};

/**
 * Everything about a piece of work that is not the chat itself.
 *
 * While it is a draft: whether the task is real or invented, an optional
 * private goal note, its sessions, and submitting it. Once submitted: that
 * it is, a way to make a related version, and whether it is entered for a
 * prize. None of what is written here is sent to the assistant or shown to
 * a reviewer.
 */
export function EpisodePanel({
  episode,
  currentSessionId,
  currentHasMessages,
  busy,
  onClose,
}: {
  episode: EpisodeInfo;
  currentSessionId: string;
  /** Whether the session on screen has anything in it yet, as of now. */
  currentHasMessages: boolean;
  /** A reply is being written in the session on screen. */
  busy: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const store = useConversationStore();
  const [pending, start] = useTransition();
  const submitted = episode.status === "submitted";
  const what = episode.isFolder ? "folder" : "conversation";

  const [provenance, setProvenance] = useState(episode.provenance ?? "");
  const [goal, setGoal] = useState(episode.goal);
  const [savedGoal, setSavedGoal] = useState(episode.goal);
  const [goalNote, setGoalNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<null | "submit" | "submit-then-related">(null);
  const [error, setError] = useState<string | null>(null);
  const [prizeEntered, setPrizeEntered] = useState(episode.prizeEntered);
  const [prizeNote, setPrizeNote] = useState<string | null>(null);

  // What would be submitted: sessions with at least one message from the
  // participant. The one on screen is judged by what is on screen.
  const included = episode.sessions.filter((s) =>
    s.id === currentSessionId ? currentHasMessages : s.userMessages > 0,
  );
  const empty = episode.sessions.length - included.length;

  function changeProvenance(value: string) {
    setProvenance(value);
    setError(null);
    start(async () => {
      const result = await saveDetailsAction(episode.id, { provenance: value });
      if (!result.ok) setError(result.message);
    });
  }

  function saveGoal() {
    setGoalNote(null);
    start(async () => {
      const result = await saveDetailsAction(episode.id, { goal: goal.trim() || null });
      if (!result.ok) return setGoalNote(result.message);
      setSavedGoal(goal);
      setGoalNote("Saved.");
    });
  }

  function newSession() {
    setError(null);
    start(async () => {
      const result = await addSessionAction(episode.id);
      if (!result.ok) return setError(result.message);
      const first = store.conversations.find((c) => c.episodeId === episode.id);
      const title = first?.isFolder ? first.episodeTitle : "Folder";
      store.addConversation({
        id: result.id,
        title: "New conversation",
        status: "draft",
        createdAt: new Date().toISOString(),
        episodeId: episode.id,
        episodeTitle: title,
        isFolder: true,
        sessionOrder: result.sessionOrder,
        episodeStatus: "draft",
        related: episode.related,
      });
      store.patchEpisode(episode.id, { isFolder: true });
      router.push(`/chat/${result.id}`);
      // The folder's own name was chosen on the server.
      router.refresh();
    });
  }

  function submit(thenRelated: boolean) {
    setError(null);
    start(async () => {
      // An unsaved goal note goes in with the submission it belongs to.
      if (goal !== savedGoal) {
        const saved = await saveDetailsAction(episode.id, { goal: goal.trim() || null });
        if (!saved.ok) return setError(saved.message);
        setSavedGoal(goal);
      }
      const result = await submitEpisodeAction(episode.id);
      if (!result.ok) {
        setConfirming(null);
        return setError(result.message);
      }
      store.patchEpisode(episode.id, { episodeStatus: "submitted" });
      setConfirming(null);
      if (thenRelated) router.push(`/chat/related/${episode.id}`);
      else router.refresh();
    });
  }

  function togglePrize(next: boolean) {
    setPrizeNote(null);
    start(async () => {
      const result = await setPrizeEntryAction(episode.id, next);
      if (!result.ok) return setPrizeNote(result.message);
      setPrizeEntered(next);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {episode.isFolder && <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {episode.isFolder ? episode.title : "This conversation"}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {submitted && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-[var(--radius)] border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              Submitted
              {episode.submittedAt ? ` ${formatEventDateTime(episode.submittedAt)}` : ""}. It
              is now fixed: nothing in it can be changed.
            </span>
          </p>
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
                "earlier work"
              )}
              , as a fresh conversation. None of its messages came with it.
            </p>
            <p className="text-xs text-muted-foreground">
              {comparisonIntentLabel(episode.madeFrom.intent)}:{" "}
              <span className="text-foreground">{episode.madeFrom.difference}</span>
            </p>
          </Block>
        )}

        <Block title="Real or invented?">
          {submitted ? (
            <p className="text-sm">{provenanceLabel(episode.provenance)}</p>
          ) : (
            <fieldset className="space-y-1.5">
              <legend className="sr-only">
                Is this based on a real task, or invented for this exercise?
              </legend>
              {PROVENANCE.map((p) => (
                <label key={p.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="provenance"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={provenance === p.value}
                    onChange={() => changeProvenance(p.value)}
                  />
                  {p.label}
                </label>
              ))}
            </fieldset>
          )}
        </Block>

        <Block
          title="Goal or notes (optional)"
          note="Private: not sent to the assistant, not shown to reviewers."
        >
          {submitted ? (
            <p className="whitespace-pre-wrap text-sm">
              {episode.goal || <span className="text-muted-foreground">None recorded.</span>}
            </p>
          ) : (
            <>
              <Textarea
                aria-label="Goal or notes"
                rows={3}
                maxLength={LIMITS.goal}
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value);
                  setGoalNote(null);
                }}
                placeholder="What are you exploring or trying to accomplish?"
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
            </>
          )}
        </Block>

        <Block
          title={episode.isFolder ? `Sessions (${episode.sessions.length})` : "Sessions"}
          note={
            submitted
              ? undefined
              : "Each session is a fresh conversation. It does not see the others, or your notes."
          }
        >
          {episode.isFolder && (
            <ul className="space-y-0.5">
              {episode.sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/chat/${s.id}`}
                    aria-current={s.id === currentSessionId ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-muted",
                      s.id === currentSessionId && "bg-muted font-medium",
                    )}
                  >
                    {s.order}.{" "}
                    {s.title === "New conversation" ? `Session ${s.order}` : s.title}
                    {!(s.id === currentSessionId ? currentHasMessages : s.userMessages > 0) && (
                      <span className="font-normal text-muted-foreground"> · empty</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!submitted && (
            <Button variant="outline" size="sm" disabled={pending} onClick={newSession}>
              <Plus className="h-3.5 w-3.5" />
              {episode.isFolder ? "New session" : "Add a session (makes this a folder)"}
            </Button>
          )}
        </Block>

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
                  <span className="block text-xs text-muted-foreground">{v.difference}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {submitted && (
          <Block
            title="Prize"
            note={`Up to ${MAX_PRIZE_ENTRIES} pieces of work each. A piece and its related versions count once. Entering changes nothing about how it is reviewed.`}
          >
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={prizeEntered}
                disabled={pending || episode.prizeClosed}
                onChange={(e) => togglePrize(e.target.checked)}
              />
              <span className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                Consider this for a prize
              </span>
            </label>
            {episode.prizeClosed && (
              <p className="text-xs text-muted-foreground">Prize entries are closed.</p>
            )}
            {prizeNote && <p className="text-xs text-danger">{prizeNote}</p>}
          </Block>
        )}
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {error && <p className="text-xs text-danger">{error}</p>}

        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Submit this {what}?</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              It will be fixed as it is now and cannot be changed or continued
              afterwards.{" "}
              {included.length === 1
                ? "One session will be submitted"
                : `${included.length} sessions will be submitted`}
              {episode.isFolder && `: ${included.map((s) => s.order).join(", ")}`}.
              {empty > 0 &&
                ` ${empty} empty session${empty === 1 ? " is" : "s are"} left out.`}
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={pending}
                onClick={() => submit(confirming === "submit-then-related")}
              >
                {pending
                  ? "Submitting..."
                  : confirming === "submit-then-related"
                    ? "Submit and continue"
                    : "Yes, submit"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : submitted ? (
          episode.comparisonOpen ? (
            <Link href={`/chat/related/${episode.id}`} className="block">
              <Button className="w-full">
                <GitCompareArrows className="h-4 w-4" />
                Create related version
              </Button>
            </Link>
          ) : null
        ) : (
          <>
            {included.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Send a message first, then submit at a natural stopping point.
                Refusals and unfinished conversations are still useful.
              </p>
            )}
            {busy && (
              <p className="text-xs text-muted-foreground">
                A reply is being written. It can be submitted once that has finished.
              </p>
            )}
            <Button
              className="w-full"
              disabled={pending || busy || included.length === 0 || !provenance}
              onClick={() => setConfirming("submit")}
            >
              Submit {what}
            </Button>
            {episode.comparisonOpen && (
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || busy || included.length === 0 || !provenance}
                onClick={() => setConfirming("submit-then-related")}
              >
                <GitCompareArrows className="h-4 w-4" />
                Submit source and create related version
              </Button>
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
