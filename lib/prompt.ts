/**
 * Turns the stored conversation into what the model is sent.
 *
 * Two things in a transcript cannot go to a provider as they are.
 *
 * An assistant turn that came back empty: a refusal with no text, a
 * provider's own filter, a failed request. These are kept in the transcript
 * because for this study they are results, but sent back as part of the next
 * prompt they are an empty message, which some providers refuse outright.
 *
 * And what leaving those out creates: two user turns in a row. Plenty of
 * hosts, particularly for open-weight models, apply the model's own chat
 * template strictly and refuse anything that does not alternate.
 *
 * Either refusal would be stored as another empty turn, so a conversation
 * could never get past its first one. So the empty turns are left out, and
 * neighbouring turns from the same speaker are joined into one. What was
 * actually sent is recorded on every reply as raw_request, so none of this
 * is hidden from the data.
 */
export type PromptTurn = { role: "user" | "assistant"; text: string };

export function buildPrompt(
  history: { role: "user" | "assistant"; content: string }[],
): PromptTurn[] {
  const turns: PromptTurn[] = [];
  for (const message of history) {
    const text = message.content;
    if (message.role === "assistant" && text.trim().length === 0) continue;
    const previous = turns[turns.length - 1];
    if (previous && previous.role === message.role) {
      previous.text = `${previous.text}\n\n${text}`;
    } else {
      turns.push({ role: message.role, text });
    }
  }
  return turns;
}
