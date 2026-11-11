import { expect, test } from "@playwright/test";
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
