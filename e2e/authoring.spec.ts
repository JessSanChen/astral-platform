import { expect, test } from "@playwright/test";
import { episodeOf, sql } from "./db";
import { newParticipant, say, startConversation, submitWork } from "./helpers";

type Sent = { messages: { role: string; content: unknown }[] };
const textOf = (m: { content: unknown }) =>
  typeof m.content === "string"
    ? m.content
    : (m.content as { text?: string }[]).map((c) => c.text ?? "").join("");

test.describe("writing conversations", () => {
  test("a conversation says where its task came from, is submitted once, and is then fixed", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Ada Author");

    // The one thing that has to be answered before starting.
    await page.goto("/chat");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByText(/First say whether this is based on a real task/)).toBeVisible();

    const goal = "PRIVATE-GOAL: seeing how the assistant explains capsids.";
    const sessionId = await startConversation(page, { provenance: "real", goal });
    const episodeId = await episodeOf(sessionId);

    // Nothing to submit until something has been said.
    await expect(page.getByRole("button", { name: "Submit conversation" })).toBeDisabled();
    await say(page, "What is a capsid?");
    await say(page, "And an envelope?");

    // Nothing but the conversation is sent to the assistant: no goal note,
    // no system text of ours.
    const [last] = await sql`
      select raw_request from message
      where conversation_id = ${sessionId} and role = 'assistant' order by seq desc limit 1
    `;
    const sent = (last.raw_request as Sent).messages;
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(sent)).not.toContain("PRIVATE-GOAL");

    await submitWork(page);

    // Fixed: no composer, and it says so.
    await expect(page.getByPlaceholder("Send a message...")).toHaveCount(0);
    await expect(page.getByText(/Submitted, so this conversation is closed/)).toBeVisible();
    await page.reload();
    await expect(page.getByPlaceholder("Send a message...")).toHaveCount(0);

    const [episode] = await sql`
      select status, task_provenance, goal_text, review_level, assignment_state, submitted_at
      from episode where id = ${episodeId}
    `;
    expect(episode).toMatchObject({
      status: "submitted",
      task_provenance: "real",
      goal_text: goal,
      // Not handed to reviewers until an organizer says who can review it.
      review_level: null,
      assignment_state: "pending",
    });
    expect(episode.submitted_at).not.toBeNull();

    // What reviewers will be shown was written out at that moment: the
    // turns, numbered, and none of the author's notes.
    const views = await sql`select kind, content from review_view where episode_id = ${episodeId}`;
    expect(views).toHaveLength(1);
    expect(views[0].kind).toBe("session");
    const turns = (views[0].content as { turns: { n: number; role: string; content: string }[] }).turns;
    expect(turns.map((t) => [t.n, t.role])).toEqual([
      [1, "user"],
      [2, "assistant"],
      [3, "user"],
      [4, "assistant"],
    ]);
    expect(JSON.stringify(views[0].content)).not.toContain("PRIVATE-GOAL");
    await context.close();
  });

  test("the server refuses a changed reply, a message after submitting, and a second submission", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Ivy Immutable");
    const sessionId = await startConversation(page);
    await say(page, "What is a plasmid?");

    const send = (body: object) =>
      page.request.post("/api/chat", { data: { conversationId: sessionId, ...body } });
    const message = {
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "One more thing." }] }],
    };

    // Asking for a different answer is refused, not merely absent from the page.
    const regenerate = await send({ ...message, regenerate: true });
    expect(regenerate.status()).toBe(400);
    expect((await regenerate.json()).code).toBe("append_only");
    await expect(page.getByRole("button", { name: "Regenerate" })).toHaveCount(0);

    await submitWork(page);
    const after = await send(message);
    expect(after.status()).toBe(409);
    expect((await after.json()).code).toBe("locked");

    const [{ n }] = await sql`
      select count(*)::int as n from message where conversation_id = ${sessionId}
    `;
    expect(n).toBe(2);
    // One submission, one frozen copy.
    const [{ versions }] = await sql`
      select count(*)::int as versions from submission where conversation_id = ${sessionId}
    `;
    expect(versions).toBe(1);
    await context.close();
  });

  test("a folder's sessions do not see each other, and are submitted together", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Fern Folder");
    const first = await startConversation(page, { folder: true });
    const episodeId = await episodeOf(first);
    await say(page, "SESSION-ONE-SECRET about ribosomes.");

    await page.getByRole("button", { name: "New session" }).click();
    await page.waitForURL((url) => /\/chat\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(first));
    const second = page.url().split("/").pop()!;
    await expect(page.getByPlaceholder("Send a message...")).toBeVisible();
    await say(page, "A fresh question about lipids.");

    // The second session started from nothing.
    const [reply] = await sql`
      select raw_request from message
      where conversation_id = ${second} and role = 'assistant' order by seq desc limit 1
    `;
    const sent = (reply.raw_request as Sent).messages;
    expect(sent).toHaveLength(1);
    expect(textOf(sent[0])).not.toContain("SESSION-ONE-SECRET");

    // A third session, left empty, is not part of what is submitted.
    await page.getByRole("button", { name: "New session" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith(second) && /\/chat\/[0-9a-f-]{36}$/.test(url.pathname));
    await expect(page.getByText("3. Session 3")).toBeVisible();

    await page.getByRole("button", { name: "Submit folder" }).click();
    await expect(page.getByText(/2 sessions will be submitted: 1, 2\./)).toBeVisible();
    await expect(page.getByText(/1 empty session is left out/)).toBeVisible();
    await page.getByRole("button", { name: "Yes, submit" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Submitted" })).toBeVisible();

    // Each session by itself, and the two together in the order things
    // happened, under neutral names.
    const views = await sql`
      select kind, conversation_id, content from review_view
      where episode_id = ${episodeId} order by kind, created_at
    `;
    expect(views.map((v) => v.kind)).toEqual(["linked", "session", "session"]);
    const linked = views[0].content as {
      sessions: string[];
      turns: { n: number; session: string; content: string }[];
    };
    expect(linked.sessions).toEqual(["A", "B"]);
    expect(linked.turns.map((t) => [t.n, t.session])).toEqual([
      [1, "A"],
      [2, "A"],
      [3, "B"],
      [4, "B"],
    ]);
    expect(views.slice(1).map((v) => v.conversation_id).sort()).toEqual([first, second].sort());
    await context.close();
  });

  test("adding a session to a conversation turns it into a folder", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Gus Grows");
    const first = await startConversation(page);
    await say(page, "What is a ribozyme?");

    // A goal written after the work began is kept as exactly that.
    await page.getByLabel("Goal or notes").fill("Thought of this afterwards.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    const revisions = await sql`
      select goal_text, after_work_began from episode_goal_revision
      where episode_id = ${await episodeOf(first)}
    `;
    expect(revisions).toEqual([
      expect.objectContaining({ goal_text: "Thought of this afterwards.", after_work_began: true }),
    ]);

    await page.getByRole("button", { name: "Add a session (makes this a folder)" }).click();
    await page.waitForURL((url) => /\/chat\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(first));
    await expect(page.getByRole("button", { name: "Submit folder" })).toBeVisible();

    const [episode] = await sql`
      select is_folder, (select count(*)::int from conversation c where c.episode_id = e.id) as sessions
      from episode e where id = ${await episodeOf(first)}
    `;
    expect(episode).toMatchObject({ is_folder: true, sessions: 2 });
    // The first session kept its messages.
    await page.goto(`/chat/${first}`);
    await expect(page.getByText("to: What is a ribozyme?")).toBeVisible();
    await context.close();
  });

  test("a related version is a fresh conversation, linked to a submitted original", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Rex Related");
    const source = await startConversation(page, { provenance: "real" });
    const sourceEpisode = await episodeOf(source);
    await say(page, "ORIGINAL-TEXT: explain codon usage.");

    // Not from a draft: asking for the form directly is turned away.
    await page.goto(`/chat/related/${sourceEpisode}`);
    await page.waitForURL(`**/chat/${source}`);

    await page.getByRole("button", { name: "Submit source and create related version" }).click();
    await page.getByRole("button", { name: "Submit and continue" }).click();
    await page.waitForURL(`**/chat/related/${sourceEpisode}`);

    // What will change has to be said before it starts.
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator("p.text-danger")).toBeVisible();
    expect(page.url()).toContain(`/chat/related/${sourceEpisode}`);
    await page
      .getByRole("radio", { name: "Change wording or format while keeping the substantive facts" })
      .check();
    await page.getByLabel("Briefly describe what you will change.").fill("Ask it more formally.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL((url) => /\/chat\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(source));
    const related = page.url().split("/").pop()!;
    const relatedEpisode = await episodeOf(related);

    await expect(page.getByText("A related version", { exact: true })).toBeVisible();
    await say(page, "Kindly explain codon usage.");
    const [reply] = await sql`
      select raw_request from message
      where conversation_id = ${related} and role = 'assistant' order by seq desc limit 1
    `;
    expect(JSON.stringify((reply.raw_request as Sent).messages)).not.toContain("ORIGINAL-TEXT");

    const [link] = await sql`
      select rv.comparison_intent, rv.intended_difference, rv.family_id,
             s.model_id as source_model, t.model_id as target_model,
             t.source_family_id, t.creation_method, t.task_provenance
      from related_version rv
      join episode s on s.id = rv.source_episode_id
      join episode t on t.id = rv.target_episode_id
      where rv.source_episode_id = ${sourceEpisode} and rv.target_episode_id = ${relatedEpisode}
    `;
    expect(link).toMatchObject({
      comparison_intent: "presentation_change",
      intended_difference: "Ask it more formally.",
      // One family, so nobody who reviews one is given the other.
      family_id: sourceEpisode,
      source_family_id: sourceEpisode,
      creation_method: "related_live",
      task_provenance: "real",
    });
    expect(link.target_model).toBe(link.source_model);

    // The original is exactly as it was.
    const [{ n }] = await sql`select count(*)::int as n from message where conversation_id = ${source}`;
    expect(n).toBe(2);
    await context.close();
  });

  test("a conversation carries on after a reply that came back empty", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Rhea Refused");
    const id = await startConversation(page);
    await say(page, "A first question.");

    // A refusal with no text, stored exactly as the app stores one. The
    // stand-in provider cannot be made to refuse a model the event offers,
    // so the turn is written in directly.
    await sql`
      insert into message (conversation_id, seq, role, content)
      values (${id}, 3, 'user', 'A question the model declines.')
    `;
    await sql`
      insert into message (conversation_id, seq, role, content, parts, finish_reason)
      values (${id}, 4, 'assistant', '', ${sql.json([{ type: "text", text: "" }])}, 'content-filter')
    `;
    await page.reload();
    await expect(page.getByText("A question the model declines.")).toBeVisible();

    const composer = page.getByPlaceholder("Send a message...");
    await composer.fill("A follow-up after the refusal.");
    await composer.press("Enter");
    await expect(page.getByText(/Reply \d+ to: A question the model declines\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    // What the model was sent: nothing empty, and never the same speaker
    // twice running.
    const [reply] = await sql`
      select raw_request from message
      where conversation_id = ${id} and role = 'assistant' and content <> ''
      order by seq desc limit 1
    `;
    const sent = (reply.raw_request as Sent).messages;
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(sent.every((m) => textOf(m).trim().length > 0)).toBe(true);

    // The empty turn is part of the record, and of what is submitted.
    await submitWork(page);
    const [view] = await sql`select content from review_view where episode_id = ${await episodeOf(id)}`;
    const turns = (view.content as { turns: { content: string; finishReason: string | null }[] }).turns;
    expect(turns).toHaveLength(6);
    expect(turns[3]).toMatchObject({ content: "", finishReason: "content-filter" });
    await context.close();
  });

  test("copying and pasting in a conversation is recorded", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Petra Paster");
    const id = await startConversation(page);
    const events = () => sql`
      select kind, surface, turn, role, char_count, content
      from clipboard_event where conversation_id = ${id} order by created_at
    `;

    const prepared = "A question I prepared earlier, somewhere else entirely.";
    const composer = page.getByPlaceholder("Send a message...");
    await composer.focus();
    await composer.evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, prepared);
    await expect.poll(async () => (await events()).length).toBe(1);
    expect((await events())[0]).toMatchObject({
      kind: "paste",
      surface: "composer",
      turn: null,
      char_count: prepared.length,
      content: prepared,
    });

    await say(page, "What is a virus?");
    await page.locator('[data-turn="2"] .markdown').selectText();
    await page.keyboard.press("ControlOrMeta+C");
    await expect.poll(async () => (await events()).length).toBe(2);
    const copied = (await events())[1];
    expect(copied).toMatchObject({ kind: "copy", surface: "message", turn: 2, role: "assistant" });
    expect(copied.content).toContain("to: What is a virus?");
    await context.close();
  });
});
