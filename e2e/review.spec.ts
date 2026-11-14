import { expect, test, type Page } from "@playwright/test";
import { CACHE_KEYS, invalidate } from "@/lib/cache";
import { claimBatch, releaseBatch } from "@/lib/reviews";
import { sql, userId } from "./db";
import {
  choose,
  labelsPanel,
  newOrganizer,
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

/** Sets how many people may review one transcript, from the console. */
async function setReviewsPerTranscript(organizer: Page, limit: number) {
  await organizer.goto("/admin/settings");
  await organizer.getByLabel("Reviews per transcript").fill(String(limit));
  await organizer.getByRole("button", { name: "Save settings" }).click();
  await expect(organizer.getByText("Saved.")).toBeVisible();
  // This process keeps its own copy of the settings for a few seconds.
  invalidate(CACHE_KEYS.eventSettings);
}

/**
 * Everything a reviewer could be handed, as one batch.
 *
 * The app's own function, asked for far more than exist, so that what comes
 * back is every transcript the reviewer is eligible for and the test can
 * say exactly which ones those must and must not include.
 */
const everythingFor = async (email: string) => claimBatch(await userId(email), 100_000);

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

  test("a transcript is reviewed by up to two people, never the same one twice", async ({
    browser,
  }) => {
    const organizer = await newOrganizer(browser, "Orla Organizer");
    const author = await newParticipant(browser, "Abe Author", "author");
    const first = await newParticipant(browser, "Rae Reviewer", "reviewer");
    const second = await newParticipant(browser, "Rui Reviewer", "reviewer");
    const third = await newParticipant(browser, "Roz Reviewer", "reviewer");
    const reviewers = [first, second, third];

    try {
      await setReviewsPerTranscript(organizer.page, 2);
      const id = await submittedTranscript(author.page, "What is an enzyme?");

      // Two people can hold it at once. A third is not offered it, and its
      // author never is.
      expect(await everythingFor(first.email)).toContain(id);
      expect(await everythingFor(second.email)).toContain(id);
      expect(await everythingFor(third.email)).not.toContain(id);
      expect(await everythingFor(author.email)).not.toContain(id);

      // Both review it, each without sight of the other.
      for (const reviewer of [first, second]) {
        await reviewer.page.goto(`/review/${id}`);
        await fillReview(reviewer.page);
        const panel = reviewPanel(reviewer.page);
        await panel.getByRole("button", { name: /submit/i }).click();
        await expect(panel).toContainText("Review saved. Thank you.");
      }
      const reviews = await sql`
        select reviewer_id from review where conversation_id = ${id}
      `;
      expect(new Set(reviews.map((r) => r.reviewer_id)).size).toBe(2);

      // Asking for a fresh batch never brings back one already reviewed.
      await releaseBatch(await userId(first.email));
      expect(await everythingFor(first.email)).not.toContain(id);
      // And it stays full for everyone else.
      await releaseBatch(await userId(third.email));
      expect(await everythingFor(third.email)).not.toContain(id);

      // Both reviews are in the export, and on the author's page in the
      // console.
      const lines = (await (await organizer.page.request.get("/api/admin/export")).text())
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      const line = lines.find((l) => l.conversation_id === id);
      expect(line.independent_reviews).toHaveLength(2);
      await organizer.page.goto(`/admin/participants/${await userId(author.email)}`);
      await expect(organizer.page.getByText("What reviewers said (2)")).toBeVisible();
      await expect(organizer.page.getByText(/Rae Reviewer · v1/)).toBeVisible();
      await expect(organizer.page.getByText(/Rui Reviewer · v1/)).toBeVisible();

      // Three people asking at the same instant for a new transcript: the
      // limit holds, because the database refuses the third place.
      for (const reviewer of reviewers) await releaseBatch(await userId(reviewer.email));
      const contested = await submittedTranscript(author.page, "What is a ribosome?");
      await Promise.all(reviewers.map((r) => everythingFor(r.email)));
      const [{ holders }] = await sql`
        select count(*)::int as holders from review_claim
        where conversation_id = ${contested} and state <> 'released'
      `;
      // Never three. One or two: people who collide over the same place
      // are passed over this time round and offered it the next.
      expect(holders).toBeGreaterThanOrEqual(1);
      expect(holders).toBeLessThanOrEqual(2);

      // With the limit at one, a transcript somebody holds goes to nobody
      // else.
      for (const reviewer of reviewers) await releaseBatch(await userId(reviewer.email));
      await setReviewsPerTranscript(organizer.page, 1);
      const single = await submittedTranscript(author.page, "What is a codon?");
      expect(await everythingFor(first.email)).toContain(single);
      expect(await everythingFor(second.email)).not.toContain(single);
    } finally {
      // Hand back everything these reviewers were holding, so no other
      // test finds its transcript already taken.
      for (const reviewer of reviewers) await releaseBatch(await userId(reviewer.email));
      await releaseBatch(await userId(author.email));
      await sql`update event_settings set max_reviews_per_transcript = 2 where id = 1`;
      invalidate(CACHE_KEYS.eventSettings);
      for (const person of [organizer, author, ...reviewers]) await person.context.close();
    }
  });
});
