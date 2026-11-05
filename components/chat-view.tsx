"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversationStore } from "@/components/conversation-store";
import { ArrowUp, PanelRightOpen, RefreshCw, Square } from "lucide-react";
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
  conversationStatus: "draft" | "submitted";
  currentVersion: number;
  labelsOpen: boolean;
  onToggleLabels: () => void;
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
  // The server passes the provider's own wording through, so show it rather
  // than a generic line that tells nobody anything.
  return (
    error.message ||
    "Something went wrong talking to the model. Try again, or pick another model."
  );
}

export function ChatView({
  conversationId,
  modelId,
  scenario,
  models,
  initialMessages,
  locked,
  conversationStatus,
  currentVersion,
  labelsOpen,
  onToggleLabels,
}: Props) {
  const store = useConversationStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stick to the bottom unless the participant has scrolled up to read
  // something, which is how every other chat app behaves.
  const stickToBottom = useRef(true);

  // Scrolling the container directly is more reliable than scrollIntoView on
  // a child, which can be thrown off by the surrounding flex layout.
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 80;
  }, []);

  // The chat lives in the shared store, so it is the same one as before if
  // this conversation has been open already. Its messages are therefore
  // shown instantly, and a reply that began earlier is still streaming into
  // it rather than having been cancelled on the way out.
  // Whether this conversation has been open before, captured before the chat
  // is created, since creating it is what marks it as seen.
  const [needsFirstSync] = useState(() => store.isFirstOpen(conversationId));
  const chat = store.getChat(conversationId, initialMessages);
  const { messages, setMessages, sendMessage, regenerate, stop, status, error } =
    useChat({ chat });

  const busy = status === "streaming" || status === "submitted";

  // Mirror the chat's own state into the store, so the rest of the interface
  // knows which conversations are mid-reply.
  useEffect(() => {
    store.setGenerating(conversationId, busy);
  }, [busy, conversationId, store]);
  // An assistant message exists from the moment a reply starts, before any
  // text arrives. Rendering it would put an empty bubble above the thinking
  // indicator, so it is left out until it has something to say.
  const visibleMessages = messages.filter(
    (m) =>
      m.role !== "assistant" ||
      m.parts?.some((p) => p.type === "text" && p.text.trim().length > 0),
  );
  const lastIsAssistant =
    visibleMessages[visibleMessages.length - 1]?.role === "assistant";

  const lastMessage = messages[messages.length - 1];
  const lastHasText = lastMessage?.parts?.some(
    (p) => p.type === "text" && p.text.trim().length > 0,
  );
  // A reply started here, then the participant moved to another conversation,
  // which tore this component down and with it the stream. The server kept
  // generating and saved the result, so rather than showing a blank gap we
  // say it is still working and wait for the answer to land.
  //
  // What is left behind is either the question on its own, or an assistant
  // bubble that was still empty when the stream was cut; both mean the reply
  // has not arrived yet.
  const awaitingElsewhere =
    !busy &&
    store.isGenerating(conversationId) &&
    (lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" && !lastHasText));
  // True between pressing send and the first token arriving. Without a visible
  // signal here a slow model looks like a failure.
  const waiting =
    awaitingElsewhere ||
    status === "submitted" ||
    (status === "streaming" &&
      !messages[messages.length - 1]?.parts?.some(
        (p) => p.type === "text" && p.text.length > 0,
      ));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    stickToBottom.current = true;
    // Name the conversation from its first message straight away, rather
    // than waiting for the server to tell us what we already know.
    if (messages.length === 0) {
      const clean = text.replace(/\s+/g, " ").trim();
      store.patchConversation(conversationId, {
        title: clean.length <= 60 ? clean : clean.slice(0, 57) + "...",
      });
    }
    sendMessage({ text });
  }

  // Jump to the newest message when the conversation first opens.
  useLayoutEffect(() => {
    scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Catch up with the server. Normally this runs once when a conversation is
  // opened, because the cached copy can be slightly behind. While a reply
  // that was started here is still being generated somewhere, it keeps
  // asking until the answer appears.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!res.ok || cancelled) return;
        const { messages: serverMessages } = (await res.json()) as {
          messages: UIMessage[];
        };
        if (cancelled) return;
        const serverLast = serverMessages[serverMessages.length - 1];
        const serverHasAnswer =
          serverLast?.role === "assistant" &&
          serverLast.parts?.some(
            (p) => p.type === "text" && p.text.trim().length > 0,
          );

        let arrived = false;
        setMessages((current) => {
          // While waiting for a reply that is being written elsewhere, the
          // server's copy wins as soon as it holds a real answer, even when
          // the counts match: what is on screen may be an empty bubble left
          // behind by the interrupted stream.
          if (awaitingElsewhere && serverHasAnswer) {
            arrived = true;
            return serverMessages;
          }
          if (serverMessages.length > current.length) return serverMessages;
          return current;
        });
        if (arrived) store.setGenerating(conversationId, false);
        else if (awaitingElsewhere) timer = setTimeout(poll, 1200);
      } catch {
        // Offline or interrupted: what is on screen is still usable.
      }
    };

    // Only ask the server when there is a reason to. On the first open the
    // cached page may be behind, and while a reply is being written elsewhere
    // the answer has to be collected. Otherwise the chat already holds the
    // live state and re-asking would be a request for nothing.
    if (needsFirstSync || awaitingElsewhere) void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conversationId, setMessages, awaitingElsewhere, needsFirstSync, store]);

  // Follow new content as it arrives: the sent message, the thinking
  // indicator, each chunk of the reply, and the controls that appear once a
  // reply finishes, which would otherwise leave the last line part-hidden.
  useEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages, waiting, status, scrollToBottom]);

  return (
    <div className="flex h-full flex-col">
      {/* Header: model is fixed once the conversation has started. */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ModelPicker
            models={models}
            value={modelId}
            onChange={() => {}}
            disabled
          />
          {conversationStatus === "submitted" && (
            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              Submitted v{currentVersion}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {locked && (
            <span className="hidden text-xs text-muted-foreground lg:inline">
              Model is fixed for this conversation
            </span>
          )}
          {!labelsOpen && (
            <Button variant="outline" size="sm" onClick={onToggleLabels}>
              <PanelRightOpen className="h-3.5 w-3.5" />
              Labels &amp; scanners
            </Button>
          )}
        </div>
      </header>

      {scenario && (
        <div className="border-b border-border bg-muted/50 px-4 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Scenario</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{scenario}</p>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-chat-scroll
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {visibleMessages.length === 0 && !waiting && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Send a message to begin.
            </p>
          )}
          {visibleMessages.map((m, i) => (
            <MessageBubble key={m.id} message={m} index={i + 1} />
          ))}

          {waiting && <ThinkingIndicator />}

          {error && (
            <div className="space-y-1 rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              <p>{errorMessage(error)}</p>
              <p className="text-xs opacity-80">
                Your message is still saved. Try again, or start a new
                conversation with a different model.
              </p>
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

function ThinkingIndicator() {
  return (
    <div className="flex justify-start pl-9">
      <div
        className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <span className="flex gap-1">
          <Dot delay="0ms" />
          <Dot delay="160ms" />
          <Dot delay="320ms" />
        </span>
        <span className="text-sm text-muted-foreground">Thinking...</span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}

function MessageBubble({
  message,
  index,
}: {
  message: UIMessage;
  index: number;
}) {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex items-start gap-2",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {/* Turn numbers, as transcripts conventionally carry, so a particular
          exchange can be referred to precisely. */}
      {!isUser && (
        <span className="mt-2.5 w-7 shrink-0 text-right font-mono text-xs text-muted-foreground">
          [{index}]
        </span>
      )}
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
      {isUser && (
        <span className="mt-2.5 w-7 shrink-0 font-mono text-xs text-muted-foreground">
          [{index}]
        </span>
      )}
    </div>
  );
}
