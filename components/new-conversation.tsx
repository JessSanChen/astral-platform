"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConversationStore } from "@/components/conversation-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/model-picker";
import { ACTIVITY_TEMPLATES, LIMITS, PROVENANCE } from "@/lib/episode-options";
import type { ModelOption } from "@/lib/models";
import { cn } from "@/lib/utils";

/**
 * Starting a conversation or a folder (specification B1 and B2).
 *
 * One thing is asked: whether the task is real or invented. Everything else
 * is optional. Nothing typed here is sent to the model.
 */
export function NewConversation({
  models,
  folder,
}: {
  models: ModelOption[];
  /** Arrived by "New folder": that button is offered first. */
  folder: boolean;
}) {
  const router = useRouter();
  const { addConversation } = useConversationStore();
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [provenance, setProvenance] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function start(asFolder: boolean) {
    if (!provenance) {
      setError("First say whether this is based on a real task or invented for this exercise.");
      return;
    }
    setCreating(true);
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelId,
        provenance,
        template,
        goal: goal.trim() || null,
        folder: asFolder,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "Could not start. Try again.");
      setCreating(false);
      return;
    }
    const created = await res.json();
    // Put it in the list immediately. Waiting for the next server render
    // meant it took seconds to appear, which looked like nothing happened.
    addConversation({
      id: created.id,
      title: "New conversation",
      status: "draft",
      createdAt: new Date().toISOString(),
      episodeId: created.episodeId,
      episodeTitle: created.episodeTitle,
      isFolder: created.isFolder,
      sessionOrder: 1,
      episodeStatus: "draft",
      related: false,
    });
    router.push(`/chat/${created.id}`);
  }

  const chosen = ACTIVITY_TEMPLATES.find((t) => t.id === template);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-7 px-6 py-12">
        <div className="space-y-1">
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            {folder ? "New folder" : "New conversation"}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {folder
              ? "A folder holds several sessions that belong to one task. Each session is a fresh conversation: it does not see the others."
              : "One conversation with the assistant. You can add more sessions later, which turns it into a folder."}
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Is this based on a real task, or invented for this exercise?
          </legend>
          {PROVENANCE.map((p) => (
            <label
              key={p.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border bg-card px-4 py-3",
                provenance === p.value ? "border-accent ring-1 ring-accent" : "border-border",
              )}
            >
              <input
                type="radio"
                name="provenance"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={provenance === p.value}
                onChange={() => {
                  setProvenance(p.value);
                  setError(null);
                }}
              />
              <span>
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-xs text-muted-foreground">{p.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-2">
          <p className="text-sm font-medium">Need a starting point? (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={template === t.id}
                onClick={() => setTemplate(template === t.id ? null : t.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  template === t.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {chosen && <p className="text-xs text-muted-foreground">{chosen.help}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Model</Label>
          <div className="rounded-[var(--radius)] border border-border bg-card px-1 py-1">
            <ModelPicker models={models} value={modelId} onChange={setModelId} />
          </div>
          <p className="text-xs text-muted-foreground">
            Fixed for the whole {folder ? "folder" : "conversation"}, and for
            any related version made from it. The assistant starts as it
            normally would, with nothing added on our side.
          </p>
        </div>

        <details className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Add a goal or notes (optional)
          </summary>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="goal">
              What are you exploring or trying to accomplish?
            </Label>
            <Textarea
              id="goal"
              rows={3}
              maxLength={LIMITS.goal}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Private. It is not sent to the assistant and reviewers do not see
              it. You can leave it empty, and add or change it while you work.
            </p>
          </div>
        </details>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            variant={folder ? "outline" : "default"}
            onClick={() => start(false)}
            disabled={creating || !modelId}
          >
            Start conversation
          </Button>
          <Button
            size="lg"
            variant={folder ? "default" : "outline"}
            onClick={() => start(true)}
            disabled={creating || !modelId}
          >
            Start folder
          </Button>
        </div>
      </div>
    </div>
  );
}
