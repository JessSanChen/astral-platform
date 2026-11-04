"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ModelPicker } from "@/components/model-picker";
import type { ModelOption } from "@/lib/models";

export function NewConversation({ models }: { models: ModelOption[] }) {
  const router = useRouter();
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [scenario, setScenario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function start() {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId, scenario: scenario.trim() || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "Could not start the conversation.");
      setCreating(false);
      return;
    }
    const { id } = await res.json();
    router.push(`/chat/${id}`);
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">New conversation</h1>
        <p className="text-sm text-muted-foreground">
          Choose a model and, if you want, set the scene. Both are fixed once
          you send your first message, so the transcript stays consistent.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Model</Label>
        <div className="rounded-[var(--radius)] border border-border bg-card px-1 py-1">
          <ModelPicker models={models} value={modelId} onChange={setModelId} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scenario">Scenario (optional)</Label>
        <Textarea
          id="scenario"
          rows={4}
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="For example: You are a helpful assistant supporting staff at a BSL-2 teaching lab."
        />
        <p className="text-xs text-muted-foreground">
          The model reads this before your first message. It sets the role or
          context the model plays. Leave blank for the model&apos;s normal behaviour.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div>
        <Button size="lg" onClick={start} disabled={creating || !modelId}>
          {creating ? "Starting..." : "Start conversation"}
        </Button>
      </div>
    </div>
  );
}
