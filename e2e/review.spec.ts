import { expect, test, type Page } from "@playwright/test";
import { sql, userId } from "./db";
import {
  choose,
  labelsPanel,
  newParticipant,
  say,
  submitButton,
  submittedTranscript,
} from "./helpers";

/** Hands one particular transcript to a reviewer, as a batch would. */
async function assign(conversationId: string, reviewerEmail: string) {
  const reviewer = await userId(reviewerEmail);
  await sql`
    insert into review_claim (conversation_id, reviewer_id)
    values (${conversationId}, ${reviewer})
    on conflict do nothing
  `;
}

function reviewPanel(page: Page) {
  return page.locator("aside").filter({ hasText: "Your assessment" });
}

async function fillReview(page: Page) {
  const panel = reviewPanel(page);
  await choose(page, "What kind of conversation does this look like?", "Benign", panel);
  await choose(page, "Is there misuse here?", "No", panel);
  await choose(page, "Who does the person appear to be?", "Student", panel);
  await panel
    .getByLabel("What do they appear to be trying to do?")
    .fill("Wants a textbook explanation.");
  await choose(page, "How confident are you?", "4 — confident", panel);
}

test.describe("independent review", () => {
  test("the reviewer sees what was submitted, and nothing the author wrote about it", async ({
    browser,
  }) => {
    const author = await newParticipant(browser, "Ada Author", "author");
    const reviewer = await newParticipant(browser, "Rex Reviewer", "reviewer");

    const id = await submittedTranscript(author.page, "What is a plasmid?", {
      type: "Adversarial",
      goal: "Secretly testing a jailbreak.",
    });

    // After submitting, the author carries on and renames the conversation.
    await say(author.page, "And how do bacteria swap them?");
    await author.page.getByTitle("Rename this conversation").click();
    await author.page.getByLabel("Conversation name").fill("JAILBREAK by Ada Author");
    await author.page.keyboard.press("Enter");

    await assign(id, reviewer.email);
    await reviewer.page.goto(`/review/${id}`);

    // The submitted version: one exchange, not two.
    await expect(reviewer.page.getByText("to: What is a plasmid?")).toBeVisible();
    await expect(reviewer.page.getByText("And how do bacteria swap them?")).toHaveCount(0);
    await expect(reviewer.page.locator("header").first()).toContainText("2 turns");

    // Nothing of the author's: not their name, their new title, their
    // labels or their stated goal. The list shows the first message.
    const everything = reviewer.page.locator("body");
    await expect(everything).not.toContainText("JAILBREAK");
    await expect(everything).not.toContainText("Ada Author");
    await expect(everything).not.toContainText("Secretly testing a jailbreak");
    await expect(reviewer.page.locator(`a[href="/review/${id}"]`)).toContainText(
      "What is a plasmid?",
    );

    await author.context.close();
    await reviewer.context.close();
  });

  test("a review left incomplete is refused without losing its answers", async ({ browser }) => {
    const author = await newParticipant(browser, "Alma Author", "author");
    const reviewer = await newParticipant(browser, "Rina Reviewer", "reviewer");
    const id = await submittedTranscript(author.page, "What does a ribosome do?");
    await assign(id, reviewer.email);
    await reviewer.page.goto(`/review/${id}`);

    const panel = reviewPanel(reviewer.page);
    await choose(reviewer.page, "What kind of conversation does this look like?", "Dual use", panel);
    await choose(reviewer.page, "Is there misuse here?", "Yes, an attempt at misuse", panel);
    await choose(reviewer.page, "How confident are you?", "2 — not very sure", panel);
    await panel.getByRole("button", { name: /submit/i }).click();

    await expect(panel).toContainText("Please complete the highlighted fields.");
    await expect(panel.getByLabel("What kind of conversation does this look like?")).toContainText(
      "Dual use",
    );
    await expect(panel.getByLabel("Is there misuse here?")).toContainText("Yes");
    await expect(panel.getByLabel("How confident are you?")).toContainText("2 — not very sure");

    await author.context.close();
    await reviewer.context.close();
  });

  test("a review is of the version that was read, and locks it", async ({ browser }) => {
    const author = await newParticipant(browser, "Avery Author", "author");
    const reviewer = await newParticipant(browser, "Robin Reviewer", "reviewer");
    const id = await submittedTranscript(author.page, "What is CRISPR?");
    await assign(id, reviewer.email);

    await reviewer.page.goto(`/review/${id}`);
    await fillReview(reviewer.page);

    // While the review sits filled in, the author adds a turn and resubmits.
    await say(author.page, "What is it used for in medicine?");
    await submitButton(author.page).click();
    await expect(labelsPanel(author.page)).toContainText("Submitted as version 2");

    // The reviewer is told, shown the new version, and keeps their answers.
    const panel = reviewPanel(reviewer.page);
    await panel.getByRole("button", { name: /submit/i }).click();
    await expect(panel).toContainText("submitted a newer version");
    await expect(reviewer.page.getByText("to: What is it used for in medicine?")).toBeVisible();
    await expect(panel.getByLabel("What do they appear to be trying to do?")).toHaveValue(
      "Wants a textbook explanation.",
    );
    await expect(panel.getByLabel("Who does the person appear to be?")).toContainText("Student");

    // Submitted again, it is accepted, against version 2.
    await panel.getByRole("button", { name: /submit/i }).click();
    await expect(panel).not.toContainText("submitted a newer version");
    await expect(panel).toContainText("Review saved. Thank you.");
    await expect
      .poll(async () => {
        const [row] = await sql`
          select r.reviewed_version, c.current_version, c.locked_at is not null as locked
          from review r join conversation c on c.id = r.conversation_id
          where c.id = ${id}
        `;
        return row && `${row.reviewed_version}/${row.current_version}/${row.locked}`;
      })
      .toBe("2/2/true");

    // The author can no longer change it.
    await author.page.reload();
    await submitButton(author.page).click();
    await expect(labelsPanel(author.page)).toContainText("independently reviewed");

    await author.context.close();
    await reviewer.context.close();
  });
});
