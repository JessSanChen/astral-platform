"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createRelatedAction } from "@/app/chat/episode-actions";
import { useConversationStore } from "@/components/conversation-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPARISON_INTENTS,
  LIMITS,
  RELATED_QUESTIONS,
} from "@/lib/episode-options";

export function RelatedVersionForm({
  sourceEpisodeId,
  sourceTitle,
  sourceSessionId,
}: {
  sourceEpisodeId: string;
  sourceTitle: string;
  sourceSessionId: string | null;
}) {
  const router = useRouter();
  const { addConversation } = useConversationStore();
  const [pending, start] = useTransition();
  const [intent, setIntent] = useState("");
  const [difference, setDifference] = useState("");
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    start(async () => {
      const result = await createRelatedAction(sourceEpisodeId, {
        intent,
        intendedDifference: difference,
      });
      if (!result.ok) return setError(result.message);
      addConversation({
        id: result.id,
        title: "New conversation",
        status: "draft",
        createdAt: new Date().toISOString(),
        episodeId: result.episodeId,
        episodeTitle: result.episodeTitle,
        isFolder: result.isFolder,
        sessionOrder: 1,
        episodeStatus: "draft",
        related: true,
      });
      router.push(`/chat/${result.id}`);
    });
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-7 px-6 py-12">
        {sourceSessionId && (
          <Link
            href={`/chat/${sourceSessionId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the original
          </Link>
        )}
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            Create a related conversation
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Start a new conversation based on something you&apos;ve already
            explored. You can investigate how changing the request, context,
            or wording affects the interaction.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Based on <span className="font-medium text-foreground">{sourceTitle}</span>.
            The new conversation starts empty: nothing from the original is
            carried into it, and the original stays exactly as submitted.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{RELATED_QUESTIONS.intent}</legend>
          {COMPARISON_INTENTS.map((c) => (
            <label
              key={c.value}
              className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border bg-card px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5"
            >
              <input
                type="radio"
                name="intent"
                aria-label={c.label}
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={intent === c.value}
                onChange={() => setIntent(c.value)}
              />
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-muted-foreground">{c.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="difference">{RELATED_QUESTIONS.difference}</Label>
          <Textarea
            id="difference"
            rows={3}
            maxLength={LIMITS.intendedDifference}
            value={difference}
            onChange={(e) => setDifference(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button size="lg" onClick={create} disabled={pending}>
          {pending ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
}
