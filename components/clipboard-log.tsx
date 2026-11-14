"use client";

import { useCallback } from "react";
import {
  CLIPBOARD_SURFACES,
  CLIPBOARD_TEXT_LIMIT,
  type ClipboardKind,
  type ClipboardSurface,
} from "@/lib/clipboard";

/**
 * Reports copying, cutting and pasting inside a conversation.
 *
 * Returns handlers for the element that wraps the conversation. Where on the
 * page something happened is read from the markup: the nearest element with
 * `data-clip` names the surface, and the nearest with `data-turn` says which
 * message.
 *
 * Nothing is changed or blocked: the clipboard works exactly as it would
 * anyway. The report is sent without waiting for an answer, and a failure
 * to send is ignored, because this must never get in the way of the work
 * it is observing.
 */
export function useClipboardLog(conversationId: string) {
  const report = useCallback(
    (kind: ClipboardKind, e: React.ClipboardEvent) => {
      try {
        const target = e.target instanceof Element ? e.target : null;
        const text = kind === "paste" ? pastedText(e) : selectedText(target);
        if (!text) return;

        // For a copy, the selection says more than the event's target,
        // which can be the page itself.
        const from =
          kind === "paste" ? target : (selectionStart() ?? target);
        const surfaceName = from?.closest<HTMLElement>("[data-clip]")?.dataset.clip;
        const surface: ClipboardSurface = (CLIPBOARD_SURFACES as readonly string[]).includes(
          surfaceName ?? "",
        )
          ? (surfaceName as ClipboardSurface)
          : "other";
        const message = from?.closest<HTMLElement>("[data-turn]");
        const turn = message ? Number(message.dataset.turn) : null;
        const role = message?.dataset.role;

        void fetch("/api/clipboard", {
          method: "POST",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId,
            kind,
            surface,
            turn: turn && Number.isInteger(turn) ? turn : null,
            role: role === "user" || role === "assistant" ? role : null,
            charCount: text.length,
            content: text.slice(0, CLIPBOARD_TEXT_LIMIT),
          }),
        }).catch(() => {});
      } catch {
        // Never let the record of an action interfere with the action.
      }
    },
    [conversationId],
  );

  return {
    onCopy: (e: React.ClipboardEvent) => report("copy", e),
    onCut: (e: React.ClipboardEvent) => report("cut", e),
    onPaste: (e: React.ClipboardEvent) => report("paste", e),
  };
}

function pastedText(e: React.ClipboardEvent) {
  return e.clipboardData?.getData("text/plain") ?? "";
}

/** What is selected: inside a text box, or on the page. */
function selectedText(target: Element | null) {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const { selectionStart: start, selectionEnd: end, value } = target;
    if (start != null && end != null && end > start) return value.slice(start, end);
  }
  return window.getSelection()?.toString() ?? "";
}

/** The element the page's selection starts in, if there is one. */
function selectionStart() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const node = selection.anchorNode;
  return node instanceof Element ? node : (node?.parentElement ?? null);
}
