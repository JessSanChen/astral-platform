"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Folder } from "lucide-react";
import { useConversationStore } from "@/components/conversation-store";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/model-picker";
import type { ModelOption } from "@/lib/models";

/**
 * Starting a conversation, or a folder: pick a model and type.
 *
 * Nothing is asked first. The conversation is created when the first
 * message is sent, and that message goes with it. What the author says
 * about the work (whether the task is real, what they were doing) is
 * asked in the panel beside the chat, before submitting.
 */
export function NewConversation({
  models,
  folder,
}: {
  models: ModelOption[];
  /** Arrived by "+ Folder": the first message opens a folder's first session. */
  folder: boolean;
}) {
  const router = useRouter();
  const store = useConversationStore();
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || creating || !modelId) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId, folder }),
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
      sessionOrder: 1,
      episodeStatus: "draft",
      related: false,
    });
    // Sent from here, so the reply is already on its way when the
    // conversation's own page opens: it picks up this same chat.
    void store.getChat(created.id, []).sendMessage({ text });
    router.push(`/chat/${created.id}`);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-medium">
          {folder && <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
          {folder ? "New folder" : "New conversation"}
        </h1>
        <ModelPicker models={models} value={modelId} onChange={setModelId} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-serif text-2xl font-medium tracking-tight">
          {folder ? "Start the first session" : "What would you like to ask?"}
        </p>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {folder
            ? "A folder holds several sessions that belong to one task. Each session is a fresh conversation: it does not see the others. You can add more once this one has started."
            : "Choose a model above and send a message. The model is fixed once the conversation has started."}
        </p>
      </div>

      <form onSubmit={send} className="border-t border-border px-4 py-3">
        {error && <p className="mx-auto mb-2 max-w-3xl text-sm text-danger">{error}</p>}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            rows={1}
            placeholder="Send a message..."
            className="max-h-48 min-h-[44px] flex-1 resize-y rounded-[var(--radius)] border border-border bg-card px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <Button type="submit" disabled={!input.trim() || creating || !modelId} className="h-11 w-11 p-0">
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
