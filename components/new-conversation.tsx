"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConversationStore } from "@/components/conversation-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ModelPicker } from "@/components/model-picker";
import type { ModelOption } from "@/lib/models";

export function NewConversation({ models }: { models: ModelOption[] }) {
  const router = useRouter();
  const { addConversation } = useConversationStore();
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function start() {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "Could not start the conversation.");
      setCreating(false);
      return;
    }
    const { id } = await res.json();
    // Put it in the list immediately. Waiting for the next server render
    // meant it took seconds to appear, which looked like nothing happened.
    addConversation({
      id,
      title: "New conversation",
      status: "draft",
      currentVersion: 0,
      createdAt: new Date().toISOString(),
    });
    router.push(`/chat/${id}`);
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl font-medium tracking-tight">New conversation</h1>
        <p className="text-sm text-muted-foreground">
          Choose a model. It is fixed once you send your first message, so
          the transcript stays consistent. Each model starts as it normally
          would, with nothing added on our side.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Model</Label>
        <div className="rounded-[var(--radius)] border border-border bg-card px-1 py-1">
          <ModelPicker models={models} value={modelId} onChange={setModelId} />
        </div>
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
