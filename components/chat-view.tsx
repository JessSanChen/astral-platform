"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import { ArrowUp, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/model-picker";
import type { ModelOption } from "@/lib/models";
import { cn } from "@/lib/utils";

type Props = {
  conversationId: string;
  modelId: string;
  scenario: string | null;
  models: ModelOption[];
  initialMessages: UIMessage[];
  locked: boolean; // true once the conversation has any messages
};

// Friendly text for the error codes our API returns.
const ERROR_TEXT: Record<string, string> = {
  rate_limited: "You are sending messages very quickly. Wait a few seconds and try again.",
  budget_exhausted: "You have reached today's usage limit. Find an organizer to raise it.",
  chat_paused: "An organizer has paused chat for everyone. Hold tight.",
  account_paused: "An organizer has paused your account.",
  model_not_allowed: "That model is no longer available. Start a new conversation with another one.",
};

function errorMessage(error: Error | undefined) {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message) as { code?: string; message?: string };
    if (parsed.code && ERROR_TEXT[parsed.code]) return ERROR_TEXT[parsed.code];
    if (parsed.message) return parsed.message;
  } catch {
    /* not JSON, fall through */
  }
  return "Something went wrong talking to the model. Your message is still here, try sending it again.";
}

export function ChatView({
  conversationId,
  modelId,
  scenario,
  models,
  initialMessages,
  locked,
}: Props) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, regenerate, stop, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
    onFinish: () => {
      // Refresh so the sidebar title and status stay in step with the server.
      router.refresh();
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    },
  });

  const busy = status === "streaming" || status === "submitted";
  const lastIsAssistant = messages[messages.length - 1]?.role === "assistant";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    sendMessage({ text });
    queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header: model is fixed once the conversation has started. */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <ModelPicker
          models={models}
          value={modelId}
          onChange={() => {}}
          disabled
        />
        {locked && (
          <span className="text-xs text-muted-foreground">
            Model is fixed for this conversation
          </span>
        )}
      </header>

      {scenario && (
        <div className="border-b border-border bg-muted/50 px-4 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Scenario</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{scenario}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {messages.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Send a message to begin.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {error && (
            <div className="rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {errorMessage(error)}
            </div>
          )}

          {lastIsAssistant && !busy && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => regenerate({ body: { conversationId, regenerate: true } })}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-border px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
            rows={1}
            placeholder="Send a message..."
            className="max-h-48 min-h-[44px] flex-1 resize-y rounded-[var(--radius)] border border-border bg-card px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={stop} className="h-11">
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} className="h-11 w-11 p-0">
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-xs text-muted-foreground">
          Enter sends, Shift+Enter adds a line.
        </p>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
