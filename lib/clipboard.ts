// Shared by the page that reports copying and pasting and the endpoint that
// records it, so the two cannot disagree about what is allowed.

export const CLIPBOARD_KINDS = ["copy", "cut", "paste"] as const;

/**
 * Where on the page it happened.
 *
 *  - composer: the box a message is typed into
 *  - message: a message in the conversation (with its turn number)
 *  - labels: the author's labels form
 *  - review: the reviewer's form
 *  - other: anywhere else on the page
 */
export const CLIPBOARD_SURFACES = [
  "composer",
  "message",
  "labels",
  "review",
  "other",
] as const;

export type ClipboardKind = (typeof CLIPBOARD_KINDS)[number];
export type ClipboardSurface = (typeof CLIPBOARD_SURFACES)[number];

/**
 * How much of the text is kept. Enough to recognise what was pasted and to
 * compare it with the message that was sent; the full length is recorded
 * separately, so nothing is hidden by the cut.
 */
export const CLIPBOARD_TEXT_LIMIT = 4000;
