import { expect, test } from "@playwright/test";
import { episodeOf, sql } from "./db";
import { fillLabels, newParticipant, say, startConversation, submitWork } from "./helpers";

type Sent = { messages: { role: string; content: unknown }[] };
const textOf = (m: { content: unknown }) =>
  typeof m.content === "string"
    ? m.content
    : (m.content as { text?: string }[]).map((c) => c.text ?? "").join("");

/** Clicks Submit where an answer is known to be missing. */
async function submitWorkExpectingRefusal(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Submit conversation" }).click();
  await expect(page.getByRole("button", { name: "Yes, submit" })).toHaveCount(0);
}

test.describe("writing conversations", () => {
  test("a conversation starts by typing, like any chat, and nothing is asked first", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Tia Types");
    await page.goto("/chat");
    // A model to pick and a box to type in. No questions, no starting points.
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("main").getByText(/real task|invented|starting point/i)).toHaveCount(0);

    await say(page, "What is a nucleosome?");
    await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;
    // The message that started it is its first message, sent once.
    const rows = await sql`select role, content from message where conversation_id = ${id} order by seq`;
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(rows[0].content).toBe("What is a nucleosome?");
    await expect(
      page.getByRole("navigation", { name: "My work" }).getByText("What is a nucleosome?"),
    ).toBeVisible();
    await say(page, "And a histone?");

    // With the panel's questions on screen, the page still fits its frame:
    // only the panels scroll, never the page itself.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Whether the task is real is asked in the panel, and only has to be
    // answered by the time the work is submitted.
    const episodeId = await episodeOf(id);
    const provenance = async () =>
      (await sql`select task_provenance from episode where id = ${episodeId}`)[0].task_provenance;
    expect(await provenance()).toBeNull();
    await fillLabels(page);
    await page.getByRole("button", { name: "Submit conversation" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Say whether the task is real or was made up for today." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, submit" })).toHaveCount(0);
    await page.getByRole("radio", { name: "Based on a real task", exact: true }).check();
    await submitWork(page);
    expect(await provenance()).toBe("real");

    // A folder starts the same way: its first message opens its first session.
    await page.goto("/chat?folder=1");
    await expect(page.getByRole("heading", { name: "New folder" })).toBeVisible();
    await say(page, "The first session of a folder.");
    await page.waitForURL((url) => /\/chat\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(id));
    await expect(page.getByRole("button", { name: "New session" })).toBeVisible();
    const [folder] = await sql`
      select is_folder from episode where id = ${await episodeOf(page.url().split("/").pop()!)}
    `;
    expect(folder.is_folder).toBe(true);
    await context.close();
  });

  test("a conversation says where its task came from, is submitted once, and is then fixed", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Ada Author");

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

    // The author's own account of the work is required: with nothing
    // answered, submitting is refused and each question is named.
    await page.getByRole("button", { name: "Submit conversation" }).click();
    await expect(page.getByText(/Answer the marked questions above first/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, submit" })).toHaveCount(0);
    for (const complaint of [
      "Choose the role you are taking.",
      "Tick at least one kind of task.",
      "Choose the scenario that fits best.",
      "Say what you expect a reviewer to decide.",
      "Say how confident you are.",
    ]) {
      await expect(page.getByRole("alert").filter({ hasText: complaint })).toBeVisible();
    }
    // "Other" has to say what it stands for.
    await page.getByRole("checkbox", { name: "Other", exact: true }).check();
    await submitWorkExpectingRefusal(page);
    await expect(page.getByRole("alert").filter({ hasText: "You ticked Other, so say what." })).toBeVisible();
    await page.getByLabel("Other kind of task: say what").fill("Checking a protocol I was sent");

    await submitWork(page, {
      role: "Researcher or scientist",
      tasks: ["Analyze or interpret data or findings"],
      scenario: "Dual-use work with potential safety relevance",
      expect: "Unsure",
      confidence: "Low",
    });

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
      // Available to reviewers at once: nobody has to release it.
      review_level: "general",
      assignment_state: "ready",
    });
    expect(episode.submitted_at).not.toBeNull();
    // The answers are stored with the work, under their own identifiers.
    const [{ author_labels: labels, author_labels_version: version }] = await sql`
      select author_labels, author_labels_version from episode where id = ${episodeId}
    `;
    expect(labels).toEqual({
      role: "researcher",
      taskKinds: ["analyze", "other"],
      taskOther: "Checking a protocol I was sent",
      scenario: "dual_use",
      expectReferral: "unsure",
      expectConfidence: "low",
    });
    expect(version).toBe("L-1.0");
    // And shown back to the author, fixed.
    await expect(page.getByText("Dual-use work with potential safety relevance")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Researcher or scientist" })).toHaveCount(0);

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
    expect(JSON.stringify(views[0].content)).not.toContain("Checking a protocol");
    expect(JSON.stringify(views[0].content)).not.toContain("dual_use");
    await context.close();
  });

  test("every model can be reached on a short screen", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Lena Laptop");
    for (const height of [900, 620]) {
      await page.setViewportSize({ width: 1280, height });
      await page.goto("/chat");
      const picker = page.locator('button[aria-haspopup="listbox"]');
      await picker.click();
      const list = page.getByRole("listbox");
      await expect(list).toBeVisible();
      // The whole list is on the screen, and scrolls where it has to.
      const box = (await list.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      const last = list.getByRole("option").last();
      const name = (await last.locator("span.text-sm").innerText()).trim();
      await last.click();
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
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

    await fillLabels(page);
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

    // A related version of a folder is a folder too: one empty session to
    // begin with, and room for more.
    await page.getByRole("link", { name: "Create related version" }).click();
    await page.getByRole("radio", { name: "Explore a related version without a precise contrast" }).check();
    await page.getByLabel("Briefly describe what you will change.").fill("Ask the same of a different organism.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(
      (url) => /\/chat\/[0-9a-f-]{36}$/.test(url.pathname) && ![first, second].some((id) => url.pathname.endsWith(id)),
    );
    await expect(page.getByRole("button", { name: "New session" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit folder" })).toBeVisible();
    const [related] = await sql`
      select e.is_folder, e.source_family_id, e.author_labels from episode e
      where e.id = ${await episodeOf(page.url().split("/").pop()!)}
    `;
    expect(related).toMatchObject({ is_folder: true, source_family_id: episodeId });
    // It is described afresh; nothing is carried over from the original.
    expect(related.author_labels).toBeNull();
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

    await fillLabels(page);
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

    // What it set out to change is in the panel, and can be put differently
    // until the related version is submitted. That it was revised is kept.
    const difference = page.getByLabel("Briefly describe what you will change.");
    await expect(difference).toHaveValue("Ask it more formally.");
    await expect(page.getByRole("button", { name: "Save change" })).toBeDisabled();
    await difference.fill("Ask it more formally, and in the passive voice.");
    await page.getByRole("radio", { name: "Explore a related version without a precise contrast" }).check();
    await page.getByRole("button", { name: "Save change" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    const revised = async () => {
      const [row] = await sql`
        select comparison_intent, intended_difference, intent_revised_at
        from related_version where target_episode_id = ${relatedEpisode}
      `;
      return row;
    };
    expect(await revised()).toMatchObject({
      comparison_intent: "exploratory",
      intended_difference: "Ask it more formally, and in the passive voice.",
    });
    expect((await revised()).intent_revised_at).not.toBeNull();

    // Submitted, it is shown as it was left and is no longer a form.
    await submitWork(page);
    await expect(page.getByLabel("Briefly describe what you will change.")).toHaveCount(0);
    await expect(page.getByText("Ask it more formally, and in the passive voice.")).toBeVisible();

    // The sessions come first in the panel, above everything asked.
    const headings = await page.locator("aside h3").allInnerTexts();
    expect(headings[0].toLowerCase()).toContain("sessions");

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

  test("the scanners give a verdict on the conversation", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Sam Scanner");
    await startConversation(page);
    await say(page, "What are the biosafety levels?");

    // The panel has two tabs; the questions about the work are on the other.
    await page.getByRole("button", { name: "Scanners" }).click();
    await expect(page.getByRole("button", { name: "Submit conversation" })).toHaveCount(0);
    // The scanner is chosen from one of our dropdowns too.
    const picker = page.getByLabel("Scanner");
    await expect(picker).toHaveRole("combobox");
    await page.getByRole("button", { name: "Run on this conversation" }).click();
    // The stand-in provider answers for whichever scanner is asked; what
    // matters here is that a result is recorded and shown.
    const result = page.locator("li").filter({ hasText: "This conversation" }).first();
    await expect(result).toContainText("at turn 2", { timeout: 30_000 });
    await expect(result).not.toContainText("Scanner failed");

    // Back on Details, the questions are still there, and the panel closes
    // from either tab.
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await expect(page.getByRole("button", { name: "Submit conversation" })).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(page.getByRole("button", { name: "Scanners" })).toHaveCount(0);
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
