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
  PROVENANCE,
  RELATED_VERSION_INSTRUCTION,
} from "@/lib/episode-options";

export function RelatedVersionForm({
  sourceEpisodeId,
  sourceTitle,
  sourceSessionId,
  sourceProvenance,
}: {
  sourceEpisodeId: string;
  sourceTitle: string;
  sourceSessionId: string | null;
  sourceProvenance: string;
}) {
  const router = useRouter();
  const { addConversation } = useConversationStore();
  const [pending, start] = useTransition();
  const [intent, setIntent] = useState("");
  const [difference, setDifference] = useState("");
  // Starts as the source's answer, in plain sight, and can be changed.
  const [provenance, setProvenance] = useState(sourceProvenance);
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    start(async () => {
      const result = await createRelatedAction(sourceEpisodeId, {
        intent,
        intendedDifference: difference,
        provenance,
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
    <div className="h-full overflow-y-auto">
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
        <div className="space-y-1">
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            Create a related version
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Of <span className="font-medium text-foreground">{sourceTitle}</span>. You
            will get a fresh, empty conversation on the same model, linked to
            the original. Nothing from the original is carried into it, and the
            original stays exactly as submitted.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What would you like to change?</legend>
          {COMPARISON_INTENTS.map((c) => (
            <label key={c.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="intent"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={intent === c.value}
                onChange={() => setIntent(c.value)}
              />
              {c.label}
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="difference">Briefly describe what you will change.</Label>
          <Textarea
            id="difference"
            rows={3}
            maxLength={LIMITS.intendedDifference}
            value={difference}
            onChange={(e) => setDifference(e.target.value)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Is the new version based on a real task, or invented for this exercise?
          </legend>
          {PROVENANCE.map((p) => (
            <label key={p.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="provenance"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={provenance === p.value}
                onChange={() => setProvenance(p.value)}
              />
              {p.label}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Starts as the original&apos;s answer. Change it if the new version
            differs.
          </p>
        </fieldset>

        <p className="rounded-[var(--radius)] border border-border bg-muted/50 px-4 py-3 text-sm leading-relaxed">
          {RELATED_VERSION_INSTRUCTION}
        </p>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button size="lg" onClick={create} disabled={pending}>
          {pending ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
}
