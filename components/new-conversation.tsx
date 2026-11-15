"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Folder, MessageSquare } from "lucide-react";
import { useConversationStore } from "@/components/conversation-store";
import { Asked, RoleAndTask } from "@/components/label-fields";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_FOLDER_LABELS,
  FOLDER_QUESTIONS,
  missingFolderLabels,
  type FolderLabels,
} from "@/lib/author-labels";
import { LIMITS } from "@/lib/episode-options";
import { FAMILY_LABELS, type ModelFamily, type ModelOption } from "@/lib/models";
import { cn } from "@/lib/utils";

const FAMILY_ORDER: ModelFamily[] = ["anthropic", "openai", "open"];

/**
 * The one place new work starts.
 *
 * Choose a conversation or a folder, choose a model, and type. No model
 * is chosen in advance. A folder is also asked the little that holds
 * across its sessions: the underlying role and kind of task. Reached with
 * a folder already in hand, it starts another session there, on whichever
 * model is picked: a folder is not tied to one.
 *
 * The work is created when the first message is sent, and that message
 * goes with it.
 */
export function NewConversation({
  models,
  target,
  startAsFolder = false,
}: {
  models: ModelOption[];
  /** A draft to add a session to. Null when starting something new. */
  target: { episodeId: string; title: string; isFolder: boolean; sessions: number } | null;
  startAsFolder?: boolean;
}) {
  const router = useRouter();
  const store = useConversationStore();
  const [kind, setKind] = useState<"conversation" | "folder">(
    startAsFolder ? "folder" : "conversation",
  );
  const [modelId, setModelId] = useState("");
  const [labels, setLabels] = useState<FolderLabels>(EMPTY_FOLDER_LABELS);
  const [goal, setGoal] = useState("");
  const [input, setInput] = useState("");
  const [modelMissing, setModelMissing] = useState(false);
  const [labelErrors, setLabelErrors] = useState<Partial<Record<keyof FolderLabels, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const folder = !target && kind === "folder";

  const grouped = FAMILY_ORDER.map((family) => ({
    family,
    items: models.filter((m) => m.family === family).sort((a, b) => a.sort - b.sort),
  })).filter((g) => g.items.length > 0);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || creating) return;
    // Say everything that is missing at once, and go to the first of it.
    const missing = folder ? missingFolderLabels(labels) : {};
    setModelMissing(!modelId);
    setLabelErrors(missing);
    const first = !modelId ? "model" : Object.keys(missing)[0];
    if (first) {
      setError("Answer what is marked above, then send.");
      document
        .querySelector(`[data-label-question="${first === "taskOther" ? "taskKinds" : first}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setCreating(true);
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        target
          ? { modelId, episodeId: target.episodeId }
          : folder
            ? { modelId, folder: true, folderLabels: labels, goal: goal.trim() || null }
            : { modelId },
      ),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      setError(body?.message ?? "Could not start. Try again.");
      setCreating(false);
      return;
    }
    const created = await res.json();
    const clean = text.replace(/\s+/g, " ").trim();
    // In the list at once, named after its first message, as it will be.
    store.addConversation({
      id: created.id,
      title: clean.length <= 60 ? clean : clean.slice(0, 57) + "...",
      status: "draft",
      createdAt: new Date().toISOString(),
      episodeId: created.episodeId,
      episodeTitle: created.episodeTitle,
      isFolder: created.isFolder,
      sessionOrder: created.sessionOrder ?? 1,
      episodeStatus: "draft",
      related: false,
    });
    // A conversation that has just become a folder shows as one.
    if (target) store.patchEpisode(target.episodeId, { isFolder: true, episodeTitle: created.episodeTitle });
    // Sent from here, so the reply is already on its way when the
    // session's own page opens: it picks up this same chat.
    void store.getChat(created.id, []).sendMessage({ text });
    router.push(`/chat/${created.id}`);
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
          <div className="space-y-1">
            <h1 className="font-serif text-3xl font-medium tracking-tight">
              {target ? `New session in ${target.isFolder ? target.title : "a new folder"}` : "New"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {target
                ? target.isFolder
                  ? "A fresh conversation in this folder. It does not see the folder's other sessions, and it can use a different model."
                  : "Adding a session turns this conversation into a folder: the two sit together as one piece of work. The new session does not see the first, and can use a different model."
                : "Choose what to start and which model to use, then send your first message."}
            </p>
          </div>

          {!target && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">What are you starting?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      value: "conversation",
                      label: "Conversation",
                      help: "One chat with one model.",
                      icon: MessageSquare,
                    },
                    {
                      value: "folder",
                      label: "Folder",
                      help: "Several sessions that belong to one task. Each is a fresh chat, on any model.",
                      icon: Folder,
                    },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border bg-card px-4 py-3",
                      kind === option.value ? "border-accent ring-1 ring-accent" : "border-border",
                    )}
                  >
                    <input
                      type="radio"
                      name="kind"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={kind === option.value}
                      onChange={() => setKind(option.value)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <option.icon className="h-4 w-4 text-muted-foreground" />
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">{option.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset data-label-question="model" className="space-y-3">
            <legend className={cn("text-sm font-medium", modelMissing && "text-danger")}>
              Which model?
            </legend>
            {grouped.map((group) => (
              <div key={group.family} className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {FAMILY_LABELS[group.family]}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((m) => (
                    <label
                      key={m.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border bg-card px-3 py-2",
                        modelId === m.id ? "border-accent ring-1 ring-accent" : "border-border",
                      )}
                    >
                      <input
                        type="radio"
                        name="model"
                        className="mt-1 h-4 w-4 shrink-0"
                        checked={modelId === m.id}
                        onChange={() => {
                          setModelId(m.id);
                          setModelMissing(false);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm">{m.displayName}</span>
                        {m.note && (
                          <span className="block text-xs text-muted-foreground">{m.note}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {modelMissing && (
              <p role="alert" className="text-xs text-danger">
                Choose a model.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Fixed for this {target || folder ? "session" : "conversation"} once it has started.
              {(target || folder) && " Other sessions in the folder can use other models."}
            </p>
          </fieldset>

          {folder && (
            <section className="space-y-5 rounded-[var(--radius)] border border-border bg-card px-4 py-4">
              <div>
                <h2 className="font-serif text-lg font-medium">About the folder</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Each session starts from these answers and can differ from them; you can
                  change them later from the folder&apos;s own page. Not sent to the assistant,
                  not shown to reviewers.
                </p>
              </div>
              <RoleAndTask
                labels={labels}
                errors={labelErrors}
                roleText={FOLDER_QUESTIONS.role}
                taskText={FOLDER_QUESTIONS.taskKinds}
                onChange={(patch) => {
                  setLabels((l) => ({ ...l, ...patch }));
                  setLabelErrors({});
                }}
              />
              <Asked id="goal" text={FOLDER_QUESTIONS.goal}>
                <Textarea
                  aria-label={FOLDER_QUESTIONS.goal}
                  rows={2}
                  maxLength={LIMITS.goal}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </Asked>
            </section>
          )}
        </div>
      </div>

      <form onSubmit={send} className="border-t border-border px-4 py-3">
        {error && (
          <p role="alert" className="mx-auto mb-2 max-w-3xl text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            rows={1}
            placeholder="Send a message..."
            className="max-h-48 min-h-[44px] flex-1 resize-y rounded-[var(--radius)] border border-border bg-card px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <Button type="submit" disabled={!input.trim() || creating} className="h-11 w-11 p-0">
            <ArrowUp className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-xs text-muted-foreground">
          Enter sends, Shift+Enter adds a line.
        </p>
      </form>
    </div>
  );
}
