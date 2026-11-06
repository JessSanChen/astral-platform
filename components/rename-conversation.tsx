"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil } from "lucide-react";
import { renameConversation } from "@/app/chat/rename-action";
import { useConversationStore } from "@/components/conversation-store";
import { cn } from "@/lib/utils";

/**
 * Renaming, from either of the two places a name appears.
 *
 * The new name is applied to the client store as soon as it is typed, so the
 * heading, the list and the scanner panel agree immediately rather than one of
 * them catching up after a round trip. All three read that same store, so
 * there is only one name to keep in step.
 */
function useRename(conversationId: string) {
  const { patchConversation } = useConversationStore();
  return async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    patchConversation(conversationId, { title: trimmed });
    const result = await renameConversation(conversationId, trimmed);
    // The server trims and shortens, so take its answer as final.
    if (result.title) patchConversation(conversationId, { title: result.title });
  };
}

/** Shared editing behaviour: select on open, save on Enter or blur, Escape cancels. */
function useNameField(title: string, rename: (t: string) => Promise<void>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const open = () => {
    setValue(title);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== title) void rename(value);
  };

  const props = {
    ref: inputRef,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") setEditing(false);
    },
    "aria-label": "Conversation name",
  };

  return { editing, open, props };
}

/** The name in the conversation header. Click it to rename. */
export function EditableTitle({
  conversationId,
  title,
}: {
  conversationId: string;
  title: string;
}) {
  const rename = useRename(conversationId);
  const { editing, open, props } = useNameField(title, rename);

  if (editing) {
    return (
      <input
        {...props}
        className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-card px-1.5 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      />
    );
  }

  return (
    <button
      onClick={open}
      title="Rename this conversation"
      className="group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[var(--radius)] px-1.5 py-1 text-left text-sm font-medium hover:bg-muted"
    >
      <span className="min-w-0 truncate">{title}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/**
 * The menu on a conversation in the list, shown on hover.
 *
 * Sits on top of the link rather than inside it, so a click lands on exactly
 * one of the two. While renaming, the field covers the row for the same
 * reason: typing a space in a field inside a link would follow the link.
 */
export function ConversationMenu({
  conversationId,
  title,
}: {
  conversationId: string;
  title: string;
}) {
  const rename = useRename(conversationId);
  const { editing, open: openField, props } = useNameField(title, rename);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Clicking anywhere else closes the menu, as a menu is expected to.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (editing) {
    return (
      <div className="absolute inset-x-1 top-1 z-20 bg-card">
        <input
          {...props}
          className="w-full rounded-[var(--radius)] border border-border bg-card px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>
    );
  }

  return (
    <div ref={ref} className="absolute right-1.5 top-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Options for ${title}`}
        aria-expanded={open}
        className={cn(
          "flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-card hover:text-foreground",
          // Also appears on keyboard focus, so it is reachable without a mouse.
          open
            ? "opacity-100"
            : "opacity-0 focus-visible:opacity-100 group-hover/item:opacity-100",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-36 overflow-hidden rounded-[var(--radius)] border border-border bg-card p-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              openField();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
        </div>
      )}
    </div>
  );
}
