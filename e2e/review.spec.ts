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
  reviewCard,
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

  test("the shared instructions and five questions come first, and a wrong answer says why", async ({
    browser,
  }) => {
    const { page, context, email } = await newParticipant(browser, "Nia Newreviewer");
    await page.goto("/review");
    // The shared definition, word for word where it matters most.
    await expect(
      page.getByRole("heading", { name: "Reviewing conversations for specialist attention" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Ignore whether the assistant answered, refused, or blocked a request when making the referral decision.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Based on the visible user activity, would you recommend specialist review?", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByText(/reference policy/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review a transcript" })).toHaveCount(0);

    await page.getByRole("radio", { name: "Whether visible user activity warrants specialist review" }).check();
    await page.getByRole("radio", { name: "Automatically refer", exact: true }).check();
    await page.getByRole("radio", { name: "No, judge the user's activity" }).check();
    await page.getByRole("radio", { name: "Skip as outside my expertise" }).check();
    await page.getByRole("radio", { name: "Skip as recognized/discussed" }).check();
    await page.getByRole("button", { name: "Check my answers" }).click();
    await expect(page.getByText(/Not that one\. A refusal is something the assistant did/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Review a transcript" })).toHaveCount(0);

    await page
      .getByRole("radio", { name: "Do not use the refusal as evidence; judge the user's activity" })
      .check();
    await page.getByRole("button", { name: "Check my answers" }).click();
    await expect(page.getByRole("button", { name: "Review a transcript" })).toBeVisible();

    const [row] = await sql`
      select policy_ready_version, (select max(version) from review_policy) as current
      from "user" where email = ${email}
    `;
    expect(row.policy_ready_version).toBe(row.current);

    // With nothing released, the answer is that there is nothing, said plainly.
    await page.getByRole("button", { name: "Review a transcript" }).click();
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

    // Available the moment it was submitted: nobody had to release it.
    const [arrived] = await sql`
      select assignment_state, review_level from episode where id = ${author.episodeId}
    `;
    expect(arrived).toMatchObject({ assignment_state: "ready", review_level: "general" });
    const reviewer = await newReviewer(browser, "Rui Reviewer");

    // Never your own work.
    await sql`
      update "user" set policy_ready_version = (select max(version) from review_policy)
      where email = ${author.email}
    `;
    await author.page.goto("/review");
    await author.page.getByRole("button", { name: "Review a transcript" }).click();
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

    // The scales are shown in words, without their codes, and the question
    // about what makes a judgment uncertain is gone.
    await expect(form.getByRole("radio", { name: "Plausible, context-dependent dual-use relevance" })).toBeVisible();
    await expect(form.getByText(/\b[ga][0-3]:/)).toHaveCount(0);
    await expect(form.getByText("What makes the judgment uncertain?")).toHaveCount(0);

    // One screen, and no menu of policy rules on it.
    await expect(
      form.getByRole("heading", {
        name: "Based on the visible user activity, would you recommend specialist review?",
      }),
    ).toBeVisible();
    await expect(form.getByText(/criterion/i)).toHaveCount(0);
    await expect(form.locator('[data-question="policyBasis"]')).toHaveCount(0);

    // Evidence is the user's messages. The assistant's reply is there to
    // read, but its number cannot be chosen.
    await expect(page.getByRole("button", { name: "Turn 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn 2", exact: true })).toHaveCount(0);
    await expect(page.locator('[data-turn="2"]')).toContainText("to: What does a ribosome do?");

    // A Yes has to point at something the user did.
    await form.locator('[data-question="verdict"]').getByRole("radio", { name: "Yes", exact: true }).check();
    await expect(form.getByRole("radio", { name: /No specific affirmative evidence/ })).toHaveCount(0);
    await form.locator('[data-question="verdict"]').getByRole("radio", { name: "No", exact: true }).check();
    await expect(form.getByRole("radio", { name: /No specific affirmative evidence/ })).toBeVisible();

    await fillReview(page, {
      verdict: "Yes",
      confidence: "Moderate",
      turns: [1],
      rationale: "What the user asks for goes beyond a general explanation.",
    });
    await expect(form.getByTestId("evidence-summary")).toHaveText("Chosen: 1");

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
             (select max(version) from review_policy) as instructions,
             a.state, a.slot, a.purpose
      from review_response r join review_assignment a on a.id = r.assignment_id
      where a.id = ${assignmentId}
    `;
    expect(stored).toMatchObject({
      verdict: "yes",
      // No rule was asked for, and the record says so.
      policy_basis: "not_asked",
      confidence: "moderate",
      evidence_mode: "turns",
      evidence_turns: [1],
      subject_sensitivity: "g0",
      aim_evidence: "a0",
      form_version: "C-2.1",
      state: "completed",
      slot: 1,
      purpose: "primary",
    });
    // The exact version of the instructions it was made under.
    expect(stored.policy_version).toBe(stored.instructions);

    // Final: the same address now only says it is done.
    await page.goto(`/review/${assignmentId}`);
    await expect(page.getByText("You have finished this one")).toBeVisible();
    await page.goto("/review");
    // Counted on its own card, apart from comparisons.
    await expect(reviewCard(page, "Transcript review")).toContainText("1 completed · 0 skipped");
    await expect(reviewCard(page, "Comparison")).toContainText("0 completed · 0 skipped");
    // The button reads the same however many have been done.
    await page.getByRole("button", { name: "Review a transcript" }).click();
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

    // Pausing is not giving up. The button reads as it did, the page says
    // one is in progress, and the button opens that one, not another.
    await page.getByRole("link", { name: "Pause" }).click();
    await page.waitForURL("**/review");
    await expect(reviewCard(page, "Transcript review")).toContainText("1 in progress");
    await expect(reviewCard(page, "Comparison")).not.toContainText("in progress");
    await expect(page.getByRole("button", { name: /Next|Continue/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Review a transcript" }).click();
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
    await expect(reviewCard(page, "Transcript review")).toContainText("0 completed · 1 skipped");
    await expect(reviewCard(page, "Comparison")).toContainText("0 completed · 0 skipped");

    // The place it held is free for someone else.
    const second = await newReviewer(browser, "Tao Takes");
    await getReview(second.page);
    await expect(second.page.getByText("to: What is a telomere?")).toBeVisible();

    await author.context.close();
    await second.context.close();
    await context.close();
  });

  test("any reviewer can be given any submission, and skipping is the first thing offered", async ({
    browser,
  }) => {
    const author = await authorWith(browser, "Uma Author", "How do phages attach?");

    // Someone who said they have no background in any of the subjects.
    const general = await newReviewer(browser, "Gil General");
    const assignmentId = await getReview(general.page);
    await expect(general.page.getByText("to: How do phages attach?")).toBeVisible();

    // What they said they could assess is kept with the assignment, as a
    // description. It decided nothing.
    const [{ routing }] = await sql`select routing from review_assignment where id = ${assignmentId}`;
    expect((routing as { familiarity: Record<string, string> }).familiarity).toEqual({});

    // The form opens with the way out, before any question.
    const form = reviewForm(general.page);
    const first = form.getByRole("button").first();
    await expect(first).toHaveText("Skip this one");
    await expect(form.getByText(/Outside your expertise, or a record you recognize\?/)).toBeVisible();
    await first.click();
    await form.getByRole("radio", { name: "Outside my expertise" }).check();
    await form.getByRole("button", { name: "Confirm skip" }).click();
    await expect(form.getByText("Skipped", { exact: true })).toBeVisible();

    // A specialist in the subject is given it the same way as anyone else.
    const specialist = await newReviewer(browser, "Spe Cialist", {
      area: INTAKE.virology,
      level: INTAKE.specialist,
    });
    const second = await getReview(specialist.page);
    await expect(specialist.page.getByText("to: How do phages attach?")).toBeVisible();
    const [{ routing: theirs }] = await sql`select routing from review_assignment where id = ${second}`;
    expect((theirs as { familiarity: Record<string, string> }).familiarity).toEqual({
      bio_microbiology: "F3",
    });
    // The explanation is optional.
    await fillReview(specialist.page, A_NO);
    await submitReview(specialist.page);
    const [stored] = await sql`
      select rationale, uncertainty_reasons, form_version from review_response where assignment_id = ${second}
    `;
    expect(stored).toMatchObject({ rationale: "", uncertainty_reasons: [], form_version: "C-2.1" });

    for (const p of [author, general, specialist]) await p.context.close();
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
    await second.page.getByRole("button", { name: "Review a transcript" }).click();
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

  test("a session submitted by itself is reviewed while its folder is still open", async ({
    browser,
  }) => {
    const author = await newParticipant(browser, "Faye Folder", "author");
    const sessionId = await startConversation(author.page, { folder: true });
    await say(author.page, "ONE-SESSION: what is an operon?");
    await fillLabels(author.page);
    await author.page.getByRole("button", { name: "Submit conversation" }).click();
    await author.page.getByRole("button", { name: "Yes, submit" }).click();
    await expect(author.page.getByRole("status").filter({ hasText: "The folder is still open" })).toBeVisible();
    const [{ status }] = await sql`
      select e.status from episode e join conversation c on c.episode_id = e.id where c.id = ${sessionId}
    `;
    expect(status).toBe("draft");

    const reviewer = await newReviewer(browser, "Rae Reviewer");
    await getReview(reviewer.page);
    await expect(reviewer.page.getByText("to: ONE-SESSION: what is an operon?")).toBeVisible();
    await fillReview(reviewer.page, A_NO);
    await submitReview(reviewer.page);

    // The organizer sees it among the submissions, as a folder not yet submitted.
    const [{ listed }] = await sql`
      select count(*)::int as listed from review_view v
      join conversation c on c.id = v.conversation_id where c.id = ${sessionId} and v.kind = 'session'
    `;
    expect(listed).toBe(1);

    await author.context.close();
    await reviewer.context.close();
  });

  test("comparing two related versions is a separate task with its own form", async ({
    browser,
  }) => {
    const author = await newParticipant(browser, "Zoe Author", "author");
    const page = author.page;
    const source = await startConversation(page);
    await say(page, "Explain codon bias plainly.");
    await fillLabels(page);
    await page.getByRole("button", { name: "Submit source and create related version" }).click();
    await page.getByRole("button", { name: "Submit and continue" }).click();
    await page.waitForURL(`**/chat/related/${source}`);
    await page
    await expect(page.getByRole("heading", { name: "Create a related conversation" })).toBeVisible();
    await page.getByRole("radio", { name: "A different way of asking" }).check();
    await page.getByLabel("What are you planning to change? (optional)").fill("INTENDED: ask more formally.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL((url) => /\/chat\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(source));
    const related = page.url().split("/").pop()!;
    await say(page, "Kindly explain codon bias.");
    await submitWork(page);
    const relatedEpisode = await episodeOf(related);

    // Unrelated work by someone else, for reviewing while a comparison waits.
    const other = await authorWith(browser, "Yan Other", "What is a plasmid, in one line?");

    const auditor = await newReviewer(browser, "Abe Auditor");
    // A pair is offered only while both ends may be shown: with one of
    // them held back by an organizer, there is nothing to compare.
    await sql`update episode set assignment_state = 'held' where id = ${relatedEpisode}`;
    await auditor.page.goto("/review");
    // Each kind of review has its own instructions, always in view under its button.
    await expect(
      auditor.page
        .getByRole("group", { name: /^Transcript review instructions/ })
        .getByRole("heading", { name: "Reviewing conversations for specialist attention" }),
    ).toBeVisible();
    await expect(
      auditor.page
        .getByRole("group", { name: "Comparison instructions" })
        .getByRole("heading", { name: "Comparing two related conversations" }),
    ).toBeVisible();
    await auditor.page.getByRole("button", { name: "Compare two related transcripts" }).click();
    await expect(auditor.page.getByText(/There is no pair for you to compare right now/)).toBeVisible();
    await release(relatedEpisode);

    await auditor.page.getByRole("button", { name: "Compare two related transcripts" }).click();
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

    // A comparison in progress does not close the other kind of review.
    // Paused, the page says so; the buttons read as they always do; and a
    // transcript can be asked for, reviewed and counted on its own.
    await auditor.page.getByRole("link", { name: "Pause" }).click();
    await auditor.page.waitForURL("**/review");
    const comparison = reviewCard(auditor.page, "Comparison");
    const transcript = reviewCard(auditor.page, "Transcript review");
    await expect(comparison).toContainText("0 completed · 0 skipped · 1 in progress");
    await expect(transcript).not.toContainText("in progress");
    await transcript.getByRole("button", { name: "Review a transcript" }).click();
    await auditor.page.waitForURL(
      (url) => /\/review\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(assignmentId),
    );
    const reviewId = auditor.page.url().split("/").pop()!;
    await expect(auditor.page.getByText("to: What is a plasmid, in one line?")).toBeVisible();
    // The comparison set aside does not run out of time while its
    // reviewer is at work on the transcript: being here keeps both.
    await sql`
      update review_assignment set last_seen_at = now() - interval '3 hours' where id = ${assignmentId}
    `;
    await auditor.page.reload();
    await expect(auditor.page.getByText("to: What is a plasmid, in one line?")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await sql`
            select state, last_seen_at > now() - interval '5 minutes' as fresh
            from review_assignment where id = ${assignmentId}
          `)[0],
      )
      .toMatchObject({ state: "active", fresh: true });
    // Both are in progress now, each under its own button, which opens it.
    await auditor.page.getByRole("link", { name: "Pause" }).click();
    await auditor.page.waitForURL("**/review");
    await expect(transcript).toContainText("1 in progress");
    await expect(comparison).toContainText("1 in progress");
    await transcript.getByRole("button", { name: "Review a transcript" }).click();
    await auditor.page.waitForURL(`**/review/${reviewId}`);
    await fillReview(auditor.page, A_NO);
    await submitReview(auditor.page);
    await auditor.page.goto("/review");
    await expect(transcript).toContainText("1 completed · 0 skipped");
    await expect(transcript).not.toContainText("in progress");
    await expect(comparison).toContainText("0 completed · 0 skipped · 1 in progress");
    await comparison.getByRole("button", { name: "Compare two related transcripts" }).click();
    await auditor.page.waitForURL(`**/review/${assignmentId}`);

    // Three questions, each answered.
    await form.getByRole("button", { name: "Submit comparison" }).click();
    await expect(form.getByText("Please complete the highlighted answers.")).toBeVisible();
    const q = (id: string) => form.locator(`[data-question="${id}"]`);
    await expect(q("topicTaskMatch")).toContainText(
      "Are these conversations about substantially the same scientific topic or task?",
    );
    await q("topicTaskMatch").getByRole("radio", { name: "Yes", exact: true }).check();
    await expect(q("scopeSimilarity")).toContainText(
      "How similar is the scientific or technical scope of the requests?",
    );
    await q("scopeSimilarity").getByRole("radio", { name: "Some meaningful differences" }).check();
    await expect(q("mainDifference")).toContainText(
      "What is the main substantive difference between the conversations?",
    );
    await q("mainDifference").getByRole("radio", { name: "Wording or presentation only" }).check();
    await expect(form.getByText("What comparison does this pair support?")).toHaveCount(0);

    // What the author set out to explore is set apart at the top.
    const said = auditor.page.getByRole("region", { name: "What the author set out to explore" });
    await expect(said).toContainText("A different way of asking");
    await expect(said).toContainText("INTENDED: ask more formally.");

    // The note is optional.
    await form.getByRole("button", { name: "Submit comparison" }).click();
    await expect(form.getByText("Comparison recorded")).toBeVisible();

    const [audit] = await sql`
      select topic_task_match, scope_similarity, main_difference,
             comparison_type, audit_note, form_version
      from pair_audit where assignment_id = ${assignmentId}
    `;
    expect(audit).toMatchObject({
      topic_task_match: "yes",
      scope_similarity: "some_differences",
      main_difference: "wording_only",
      comparison_type: null,
      audit_note: null,
      form_version: "D-2.0",
    });

    // Having seen both, the auditor reviews neither. The two counts stand apart.
    await auditor.page.goto("/review");
    await expect(reviewCard(auditor.page, "Transcript review")).toContainText("1 completed · 0 skipped");
    await expect(reviewCard(auditor.page, "Comparison")).toContainText("1 completed · 0 skipped");
    await auditor.page.getByRole("button", { name: "Review a transcript" }).click();
    await expect(auditor.page.getByText(NOTHING)).toBeVisible();

    await author.context.close();
    await other.context.close();
    await auditor.context.close();
  });
});
