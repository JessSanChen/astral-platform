import { expect, test } from "@playwright/test";
import { DEFAULT_MODELS } from "@/lib/models";
import { sql } from "./db";
import {
  choose,
  fillLabels,
  labelsPanel,
  newParticipant,
  say,
  startConversation,
  submitButton,
} from "./helpers";

test.describe("a conversation, from first message to submitted transcript", () => {
  test("chat, name, label, submit, and submit again", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Tara Transcript");

    const id = await startConversation(page);
    await say(page, "How do vaccines create immune memory?");

    // Named after its first message, in the header and in the list.
    const header = page.locator("header").first();
    await expect(header).toContainText("How do vaccines create immune memory?");
    const listed = page.locator(`a[href="/chat/${id}"]`);
    await expect(listed).toContainText("How do vaccines create immune memory?");
    await expect(listed).toContainText("Draft");

    // Renamed from the header; the list follows at once.
    await page.getByTitle("Rename this conversation").click();
    await page.getByLabel("Conversation name").fill("Immune memory basics");
    await page.keyboard.press("Enter");
    await expect(listed).toContainText("Immune memory basics");

    // A second message does not put the old name back.
    await say(page, "And how long does that memory last?");
    await expect(header).toContainText("Immune memory basics");

    // Submitting with an answer missing is refused, and keeps what was given.
    const panel = labelsPanel(page);
    await choose(page, "What kind of transcript is this?", "Benign", panel);
    await choose(page, "What role were you playing?", "Student", panel);
    await submitButton(page).click();
    await expect(panel).toContainText("Please complete the highlighted fields.");
    await expect(panel).toContainText("Say how the model responded.");
    await expect(panel.getByLabel("What kind of transcript is this?")).toContainText("Benign");
    await expect(panel.getByLabel("What role were you playing?")).toContainText("Student");

    // Completed, it goes through as version 1 and the form still holds it.
    await fillLabels(page);
    await submitButton(page).click();
    await expect(panel).toContainText("Submitted as version 1");
    await expect(listed).toContainText("Submitted v1");
    await expect(panel.getByLabel("How did the model respond?")).toContainText("Fully complied");
    await expect(
      panel.getByLabel("What were you trying to get the model to do?"),
    ).toHaveValue(/Understand the basics/);

    // Changing an answer and submitting again makes version 2.
    await choose(page, "How did the model respond?", "Partially complied", panel);
    await submitButton(page).click();
    await expect(panel).toContainText("Submitted as version 2");

    // And all of it is still there after a reload.
    await page.reload();
    await expect(page.locator("header").first()).toContainText("Immune memory basics");
    await expect(labelsPanel(page).getByLabel("How did the model respond?")).toContainText(
      "Partially complied",
    );
    await expect(page.getByText("to: And how long does that memory last?")).toBeVisible();
    await context.close();
  });

  test("a new conversation asks for a model and nothing else", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Nora New");
    await page.goto("/chat");

    await expect(page.getByRole("heading", { name: "New conversation" })).toBeVisible();
    // There used to be a box for a scenario, sent to the model ahead of the
    // conversation. It is gone: every model starts as it normally would.
    await expect(page.getByText(/scenario/i)).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);

    // A browser tab left open from before the change still sends one. It is
    // dropped rather than refused, and never reaches the model.
    const created = await page.request.post("/api/conversations", {
      data: { modelId: DEFAULT_MODELS[0].id, scenario: "You are a pirate." },
    });
    expect(created.ok()).toBe(true);
    const { id } = await created.json();
    const [row] = await sql`select scenario from conversation where id = ${id}`;
    expect(row.scenario).toBeNull();

    await page.goto(`/chat/${id}`);
    await say(page, "Hello there.");
    await expect(page.getByText("scenario seen")).toHaveCount(0);
    await context.close();
  });

  test("label answers survive the scanners tab and another conversation", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Wanda Wanderer");
    const id = await startConversation(page);
    await say(page, "What is a plasmid?");

    const panel = labelsPanel(page);
    await choose(page, "What kind of transcript is this?", "Dual use", panel);
    await panel
      .getByLabel("What were you trying to get the model to do?")
      .fill("Typed and not saved.");

    await page.getByRole("button", { name: "Scanners" }).click();
    await expect(page.getByRole("button", { name: "Run on this conversation" })).toBeVisible();
    await page.getByRole("button", { name: "Labels" }).click();
    await expect(labelsPanel(page).getByLabel("What kind of transcript is this?")).toContainText(
      "Dual use",
    );

    await page.getByRole("link", { name: "New conversation" }).click();
    await page.waitForURL(/\/chat$/);
    await page.locator(`a[href="/chat/${id}"]`).click();
    await page.waitForURL(`**/chat/${id}`);
    await expect(
      labelsPanel(page).getByLabel("What were you trying to get the model to do?"),
    ).toHaveValue("Typed and not saved.");
    await context.close();
  });

  test("regenerating replaces the last reply rather than adding one", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Rita Regenerate");
    await startConversation(page);
    await say(page, "What is a codon?");

    const reply = page.getByText(/Reply \d+ to: What is a codon\?/);
    await expect(reply).toHaveCount(1);
    const first = await reply.innerText();

    await page.getByRole("button", { name: "Regenerate" }).click();
    // The stand-in numbers its replies, so a new one reads differently.
    await expect(reply).not.toHaveText(first);
    await expect(reply).toHaveCount(1);

    // Still one question and one answer after a reload: the first reply is
    // kept in the database, and kept out of the conversation.
    await page.reload();
    await expect(page.getByText(/Reply \d+ to: What is a codon\?/)).toHaveCount(1);
    await expect(page.getByText("[2]")).toBeVisible();
    await expect(page.getByText("[3]")).toHaveCount(0);
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

    // The stand-in answers the last user turn it was sent, which is now
    // the declined question and the follow-up joined together.
    const composer = page.getByPlaceholder("Send a message...");
    await composer.fill("A follow-up after the refusal.");
    await composer.press("Enter");
    await expect(page.getByText(/Reply \d+ to: A question the model declines\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    // What the model was sent: nothing empty, and never the same speaker
    // twice running. The two user turns either side of the refusal arrive
    // as one.
    const [reply] = await sql`
      select raw_request from message
      where conversation_id = ${id} and role = 'assistant' and content <> ''
      order by seq desc limit 1
    `;
    const sent = (reply.raw_request as { messages: { role: string; content: unknown }[] }).messages;
    const text = (m: { content: unknown }) =>
      typeof m.content === "string"
        ? m.content
        : (m.content as { text?: string }[]).map((c) => c.text ?? "").join("");
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(sent.every((m) => text(m).trim().length > 0)).toBe(true);
    expect(text(sent[2])).toContain("A question the model declines.");
    expect(text(sent[2])).toContain("A follow-up after the refusal.");

    // The transcript itself still holds the empty turn.
    const [{ count }] = await sql`
      select count(*)::int from message
      where conversation_id = ${id} and role = 'assistant' and content = ''
    `;
    expect(count).toBe(1);
    await context.close();
  });

  test("the scanners give a verdict on the conversation", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Sam Scanner");
    await startConversation(page);
    await say(page, "What are the biosafety levels?");

    await page.getByRole("button", { name: "Scanners" }).click();
    // The scanner is chosen from one of our dropdowns too.
    const picker = page.getByLabel("Scanner");
    await expect(picker).toHaveRole("combobox");
    await page.getByRole("button", { name: "Run on this conversation" }).click();
    // The stand-in provider answers for whichever scanner is asked; what
    // matters here is that a result is recorded and shown.
    const result = page.locator("li").filter({ hasText: "This conversation" }).first();
    await expect(result).toContainText("at turn 2", { timeout: 30_000 });
    await expect(result).not.toContainText("Scanner failed");
    await context.close();
  });
});
