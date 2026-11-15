import { expect, test, type Browser } from "@playwright/test";
import { SETTINGS_TTL_MS } from "@/lib/cache";
import { episodeOf, release, resetSettings, sql, userId } from "./db";
import {
  A_NO,
  INTAKE,
  fillLabels,
  fillReview,
  getReview,
  newParticipant,
  newReviewer,
  reviewForm,
  say,
  startConversation,
  submitReview,
  submitWork,
} from "./helpers";

/** Someone who has submitted one conversation, released for anyone to review. */
async function authorWith(browser: Browser, name: string, question: string, goal?: string) {
  const author = await newParticipant(browser, name, "author");
  const sessionId = await startConversation(author.page, { goal });
  await say(author.page, question);
  await submitWork(author.page);
  const episodeId = await episodeOf(sessionId);
  return { ...author, sessionId, episodeId };
}

const NOTHING = /There is nothing for you to review right now/;

test.describe("independent review", () => {
  // Each test decides what is on offer. Whatever earlier tests released is
  // taken off the table first.
  test.beforeEach(async () => {
    await sql`update episode set assignment_state = 'held' where assignment_state = 'ready'`;
  });
  test.afterEach(async () => {
    await resetSettings();
  });

  test("the policy and four questions come first, and a wrong answer says why", async ({
    browser,
  }) => {
    const { page, context, email } = await newParticipant(browser, "Nia Newreviewer");
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Test policy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Get a review" })).toHaveCount(0);

    await page.getByRole("radio", { name: /Whether the displayed record meets/ }).check();
    await page.getByRole("radio", { name: "Automatically negative." }).check();
    await page.getByRole("radio", { name: "Skip as outside expertise." }).check();
    await page.getByRole("radio", { name: "Skip as recognized/discussed." }).check();
    await page.getByRole("button", { name: "Check my answers" }).click();
    await expect(page.getByText(/Not that one\. A refusal is something the assistant did/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Get a review" })).toHaveCount(0);

    await page.getByRole("radio", { name: /Apply the policy; refusal alone/ }).check();
    await page.getByRole("button", { name: "Check my answers" }).click();
    await expect(page.getByRole("button", { name: "Get a review" })).toBeVisible();

    const [row] = await sql`
      select policy_ready_version, (select max(version) from review_policy) as current
      from "user" where email = ${email}
    `;
    expect(row.policy_ready_version).toBe(row.current);

    // With nothing released, the answer is that there is nothing, said plainly.
    await page.getByRole("button", { name: "Get a review" }).click();
    await expect(page.getByText(NOTHING)).toBeVisible();
    await context.close();
  });

  test("a reviewer is given one record without the author's notes, and answers once", async ({
    browser,
  }) => {
    const author = await authorWith(
      browser,
      "Alma Author",
      "What does a ribosome do?",
      "PRIVATE-GOAL: a note only I should see.",
    );

    // Not released yet: nobody is offered it.
    const reviewer = await newReviewer(browser, "Rui Reviewer");
    await reviewer.page.goto("/review");
    await reviewer.page.getByRole("button", { name: "Get a review" }).click();
    await expect(reviewer.page.getByText(NOTHING)).toBeVisible();

    await release(author.episodeId);

    // Never your own work.
    await sql`
      update "user" set policy_ready_version = (select max(version) from review_policy)
      where email = ${author.email}
    `;
    await author.page.goto("/review");
    await author.page.getByRole("button", { name: "Get a review" }).click();
    await expect(author.page.getByText(NOTHING)).toBeVisible();

    const page = reviewer.page;
    const assignmentId = await getReview(page);
    await expect(page.getByText("One session")).toBeVisible();
    await expect(page.getByText("to: What does a ribosome do?")).toBeVisible();
    const everything = await page.locator("body").innerText();
    expect(everything).not.toContain("PRIVATE-GOAL");
    expect(everything).not.toContain("Alma Author");

    // The item belongs to the person it was given to and nobody else.
    await author.page.goto(`/review/${assignmentId}`);
    await expect(author.page.getByText(/could not be found|not found/i).first()).toBeVisible();

    // Nothing filled in: refused, by name.
    const form = reviewForm(page);
    await form.getByRole("button", { name: "Submit review" }).click();
    await expect(form.getByText("Please complete the highlighted answers.")).toBeVisible();
    await expect(form.getByText("Answer the main question.")).toBeVisible();

    // The criteria on offer are the ones that go with the answer.
    await form.locator('[data-question="verdict"]').getByRole("radio", { name: "Yes", exact: true }).check();
    await expect(form.getByRole("radio", { name: /^T1:/ })).toBeVisible();
    await expect(form.getByRole("radio", { name: "No qualifying criterion" })).toHaveCount(0);

    await fillReview(page, {
      verdict: "Yes",
      basis: /^T1:/,
      confidence: "Moderate",
      turns: [2],
      rationale: "The reply is what rule T1 lists. Based on one exchange only.",
    });
    await expect(form.getByTestId("evidence-summary")).toHaveText("Chosen: 2");

    // Copying out of the record is noted, as it is for the author.
    await page.locator('[data-turn="2"] .markdown').selectText();
    await page.keyboard.press("ControlOrMeta+C");
    await expect
      .poll(async () => {
        const rows = await sql`
          select surface, turn from clipboard_event
          where user_id = ${await userId(reviewer.email)} and kind = 'copy'
        `;
        return rows[0] ?? null;
      })
      .toMatchObject({ surface: "message", turn: 2 });

    await submitReview(page);

    const [stored] = await sql`
      select r.verdict, r.policy_basis, r.confidence, r.evidence_mode, r.evidence_turns,
             r.subject_sensitivity, r.aim_evidence, r.form_version, r.policy_version,
             a.state, a.slot, a.purpose
      from review_response r join review_assignment a on a.id = r.assignment_id
      where a.id = ${assignmentId}
    `;
    expect(stored).toMatchObject({
      verdict: "yes",
      policy_basis: "T1",
      confidence: "moderate",
      evidence_mode: "turns",
      evidence_turns: [2],
      subject_sensitivity: "g0",
      aim_evidence: "a0",
      form_version: "C-1.1",
      state: "completed",
      slot: 1,
      purpose: "primary",
    });
    expect(stored.policy_version).toBeGreaterThan(0);

    // Final: the same address now only says it is done.
    await page.goto(`/review/${assignmentId}`);
    await expect(page.getByText("You have finished this one")).toBeVisible();
    await page.goto("/review");
    await expect(page.getByText(/1 reviewed, 0 compared, 0 skipped/)).toBeVisible();
    await page.getByRole("button", { name: "Next item" }).click();
    await expect(page.getByText(NOTHING)).toBeVisible();

    await author.context.close();
    await reviewer.context.close();
  });

  test("a reload or a pause keeps the same item and what was filled in", async ({ browser }) => {
    const author = await authorWith(browser, "Paz Author", "What is a lysosome?");
    const other = await authorWith(browser, "Quin Author", "What is a vacuole?");
    await release(author.episodeId);
    await release(other.episodeId);

    const { page, context } = await newReviewer(browser, "Rosa Resumes");
    const assignmentId = await getReview(page);
    const shown = (await page.locator('[data-turn="1"] p.whitespace-pre-wrap').textContent())!;
    const form = reviewForm(page);
    await form.locator('[data-question="verdict"]').getByRole("radio", { name: "No", exact: true }).check();
    await form.locator('[data-question="rationale"]').getByRole("textbox").fill("Half a thought.");

    await page.reload();
    await expect(page.locator('[data-turn="1"]')).toContainText(shown);
    await expect(
      reviewForm(page).locator('[data-question="verdict"]').getByRole("radio", { name: "No", exact: true }),
    ).toBeChecked();
    await expect(reviewForm(page).locator('[data-question="rationale"]').getByRole("textbox")).toHaveValue(
      "Half a thought.",
    );

    // Pausing is not giving up: the same item is waiting, and no other is offered.
    await page.getByRole("link", { name: "Pause" }).click();
    await page.waitForURL("**/review");
    await expect(page.getByRole("button", { name: /Get a review|Next item/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue where you left off" }).click();
    await page.waitForURL(`**/review/${assignmentId}`);
    await expect(page.locator('[data-turn="1"]')).toContainText(shown);

    const [{ n }] = await sql`
      select count(*)::int as n from review_assignment where id = ${assignmentId} and state = 'active'
    `;
    expect(n).toBe(1);
    await author.context.close();
    await other.context.close();
    await context.close();
  });

  test("skipping records a reason and no verdict, and the record does not come back", async ({
    browser,
  }) => {
    const author = await authorWith(browser, "Sol Author", "What is a telomere?");
    await release(author.episodeId);
    const { page, context } = await newReviewer(browser, "Skye Skips");
    const assignmentId = await getReview(page);

    await reviewForm(page).getByRole("button", { name: "Skip", exact: true }).click();
    await expect(reviewForm(page).getByRole("button", { name: "Confirm skip" })).toBeDisabled();
    await reviewForm(page).getByRole("radio", { name: "Outside my expertise" }).check();
    await reviewForm(page).getByLabel(/Anything to add/).fill("Not my field.");
    await reviewForm(page).getByRole("button", { name: "Confirm skip" }).click();
    await expect(reviewForm(page).getByText("Skipped", { exact: true })).toBeVisible();

    const [row] = await sql`
      select state, skip_reason, skip_note,
             (select count(*)::int from review_response r where r.assignment_id = a.id) as responses
      from review_assignment a where id = ${assignmentId}
    `;
    expect(row).toMatchObject({
      state: "skipped",
      skip_reason: "outside_expertise",
      skip_note: "Not my field.",
      responses: 0,
    });

    // Shown once is shown: it is not offered to the same person again.
    await reviewForm(page).getByRole("button", { name: "Next item" }).click();
    await expect(reviewForm(page).getByText(/nothing more for you right now/)).toBeVisible();
    await page.goto("/review");
    await expect(page.getByText(/0 reviewed, 0 compared, 1 skipped/)).toBeVisible();

    // The place it held is free for someone else.
    const second = await newReviewer(browser, "Tao Takes");
    await getReview(second.page);
    await expect(second.page.getByText("to: What is a telomere?")).toBeVisible();

    await author.context.close();
    await second.context.close();
    await context.close();
  });

  test("a record that needs subject knowledge goes only to someone who says they have it", async ({
    browser,
  }) => {
    const author = await authorWith(browser, "Uma Author", "How do phages attach?");
    await release(author.episodeId, "specialist", ["bio_microbiology"]);

    const general = await newReviewer(browser, "Gil General");
    await general.page.goto("/review");
    await general.page.getByRole("button", { name: "Get a review" }).click();
    await expect(general.page.getByText(NOTHING)).toBeVisible();

    // Able to assess routine work in the subject is not enough for a
    // specialist record.
    const routine = await newReviewer(browser, "Rae Routine", {
      area: INTAKE.virology,
      level: INTAKE.routine,
    });
    await routine.page.goto("/review");
    await routine.page.getByRole("button", { name: "Get a review" }).click();
    await expect(routine.page.getByText(NOTHING)).toBeVisible();

    const specialist = await newReviewer(browser, "Spe Cialist", {
      area: INTAKE.virology,
      level: INTAKE.specialist,
    });
    const assignmentId = await getReview(specialist.page);
    await expect(specialist.page.getByText("to: How do phages attach?")).toBeVisible();
    // Why they were eligible is kept with the assignment.
    const [{ routing }] = await sql`select routing from review_assignment where id = ${assignmentId}`;
    expect((routing as { familiarity: Record<string, string> }).familiarity).toEqual({
      bio_microbiology: "F3",
    });

    // A routine record in the subject is open to both of them.
    const second = await authorWith(browser, "Vik Author", "What is a plaque assay for?");
    await release(second.episodeId, "routine", ["bio_microbiology"]);
    await getReview(routine.page);
    await expect(routine.page.getByText("to: What is a plaque assay for?")).toBeVisible();
    await general.page.getByRole("button", { name: "Get a review" }).click();
    await expect(general.page.getByText(NOTHING)).toBeVisible();

    for (const p of [author, general, routine, specialist, second]) await p.context.close();
  });

  test("a record with no place left is not handed out, and a held one is not accepted", async ({
    browser,
  }) => {
    await sql`update event_settings set reviews_per_view = 1 where id = 1`;
    const author = await authorWith(browser, "Wes Author", "What is chromatin?");
    await release(author.episodeId);
    const first = await newReviewer(browser, "Xia First");
    const second = await newReviewer(browser, "Yan Second");
    // Settings are read afresh at most this often.
    await first.page.waitForTimeout(SETTINGS_TTL_MS + 500);

    const assignmentId = await getReview(first.page);
    // The one place is taken while the first reviewer is reading.
    await second.page.goto("/review");
    await second.page.getByRole("button", { name: "Get a review" }).click();
    await expect(second.page.getByText(NOTHING)).toBeVisible();

    // An organizer puts the record on hold while it is being read.
    await sql`update episode set assignment_state = 'held' where id = ${author.episodeId}`;
    await fillReview(first.page, A_NO);
    await reviewForm(first.page).getByRole("button", { name: "Submit review" }).click();
    await expect(reviewForm(first.page).getByText(/put this record on hold/)).toBeVisible();
    const [{ n }] = await sql`
      select count(*)::int as n from review_response where assignment_id = ${assignmentId}
    `;
    expect(n).toBe(0);

    for (const p of [author, first, second]) await p.context.close();
  });

  test("comparing two related versions is a separate task with its own form", async ({
    browser,
  }) => {
    const author = await newParticipant(browser, "Zoe Author", "author");
    const page = author.page;
    const source = await startConversation(page);
    const sourceEpisode = await episodeOf(source);
    await say(page, "Explain codon bias plainly.");
    await fillLabels(page);
    await page.getByRole("button", { name: "Submit source and create related version" }).click();
    await page.getByRole("button", { name: "Submit and continue" }).click();
    await page.waitForURL(`**/chat/related/${sourceEpisode}`);
    await page
      .getByRole("radio", { name: "Change wording or format while keeping the substantive facts" })
      .check();
    await page.getByLabel("Briefly describe what you will change.").fill("INTENDED: ask more formally.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL((url) => /\/chat\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(source));
    const related = page.url().split("/").pop()!;
    await say(page, "Kindly explain codon bias.");
    await submitWork(page);
    const relatedEpisode = await episodeOf(related);

    const auditor = await newReviewer(browser, "Abe Auditor");
    // A pair is offered only once both ends may be shown.
    await release(sourceEpisode);
    await auditor.page.goto("/review");
    await auditor.page.getByRole("button", { name: "Compare two versions" }).click();
    await expect(auditor.page.getByText(/There is no pair for you to compare right now/)).toBeVisible();
    await release(relatedEpisode);

    await auditor.page.getByRole("button", { name: "Compare two versions" }).click();
    await auditor.page.waitForURL(/\/review\/[0-9a-f-]{36}$/);
    const assignmentId = auditor.page.url().split("/").pop()!;
    const form = auditor.page.getByRole("complementary", { name: "Comparison form" });
    await expect(auditor.page.getByText("INTENDED: ask more formally.")).toBeVisible();
    await expect(
      auditor.page.getByRole("region", { name: "Version 1 (original)" }).getByText("to: Explain codon bias plainly."),
    ).toBeVisible();
    await expect(
      auditor.page
        .getByRole("region", { name: "Version 2 (related version)" })
        .getByText("to: Kindly explain codon bias."),
    ).toBeVisible();

    const q = (id: string) => form.locator(`[data-question="${id}"]`);
    await q("topicTaskMatch").getByRole("radio", { name: "Yes", exact: true }).check();
    await q("sensitivityMatch").getByRole("radio", { name: "Partly", exact: true }).check();
    await q("intendedChangeRealized").getByRole("radio", { name: "Yes", exact: true }).check();
    // "None identified" stands alone.
    await q("unintendedDifferences").getByRole("checkbox", { name: "Length" }).check();
    await q("unintendedDifferences").getByRole("checkbox", { name: "None identified" }).check();
    await expect(q("unintendedDifferences").getByRole("checkbox", { name: "Length" })).not.toBeChecked();
    await q("comparisonType").getByRole("radio", { name: "Meaning-preserving variation" }).check();

    // An imperfect match has to be explained.
    await form.getByRole("button", { name: "Submit comparison" }).click();
    await expect(form.getByText("Briefly explain the mismatch or limitation.")).toBeVisible();
    await q("auditNote").getByRole("textbox").fill("The second is a little more guarded.");
    await form.getByRole("button", { name: "Submit comparison" }).click();
    await expect(form.getByText("Comparison recorded")).toBeVisible();

    const [audit] = await sql`
      select topic_task_match, sensitivity_match, intended_change_realized,
             unintended_differences, comparison_type, audit_note, form_version
      from pair_audit where assignment_id = ${assignmentId}
    `;
    expect(audit).toMatchObject({
      topic_task_match: "yes",
      sensitivity_match: "partly",
      intended_change_realized: "yes",
      unintended_differences: ["none_identified"],
      comparison_type: "meaning_preserving",
      audit_note: "The second is a little more guarded.",
      form_version: "D-1.1",
    });

    // Having seen both, the auditor reviews neither.
    await auditor.page.goto("/review");
    await expect(auditor.page.getByText(/0 reviewed, 1 compared, 0 skipped/)).toBeVisible();
    await auditor.page.getByRole("button", { name: "Get a review" }).click();
    await expect(auditor.page.getByText(NOTHING)).toBeVisible();

    await author.context.close();
    await auditor.context.close();
  });
});
