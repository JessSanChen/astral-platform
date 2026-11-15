import { expect, test } from "@playwright/test";
import { SETTINGS_TTL_MS } from "@/lib/cache";
import { INTAKE_VERSION } from "@/lib/intake";
import { formatEventDateTime, fromEventInputValue } from "@/lib/time";
import { episodeOf, passInstructionCheck, release, resetSettings, sql } from "./db";
import {
  choose,
  fillReview,
  getReview,
  newOrganizer,
  newParticipant,
  newReviewer,
  reviewForm,
  say,
  signIn,
  startConversation,
  submitReview,
  submitWork,
  submittedConversation,
} from "./helpers";

type Line = Record<string, unknown> & { record: string };
const exportLines = async (page: import("@playwright/test").Page, path = "/api/admin/export") =>
  (await (await page.request.get(path)).text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Line);

test.describe("the organizer console", () => {
  test.afterEach(async () => {
    await resetSettings();
  });

  test("is closed to participants", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Peeking Pat");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole("link", { name: "Organize" })).toHaveCount(0);

    const exported = await page.request.get("/api/admin/export", { maxRedirects: 0 });
    expect(exported.status()).not.toBe(200);
    await context.close();
  });

  test("counts what was submitted, and promotes a participant", async ({ browser }) => {
    const participant = await newParticipant(browser, "Polly Participant");
    const submitted = await submittedConversation(participant.page, "What is a virus?");
    // And one more, started and never submitted.
    const draft = await startConversation(participant.page);
    await say(participant.page, "And what is a bacteriophage?");
    const organizer = await newOrganizer(browser);
    const page = organizer.page;

    // The overview counts in the new terms.
    await page.goto("/admin");
    await expect(page.getByText("Work submitted")).toBeVisible();
    await expect(page.getByText("Waiting to be released", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Submissions", exact: true })).toBeVisible();

    await page.goto("/admin/participants");
    const headers = await page.locator("thead th").allInnerTexts();
    const column = (name: string) => headers.findIndex((h) => h.trim() === name);
    const row = page.locator("tr").filter({ hasText: participant.email });
    await expect(row).toContainText("Active");
    await expect(row.locator("td").nth(column("Submitted"))).toHaveText("1");
    await expect(row.locator("td").nth(column("Drafts"))).toHaveText("1");
    await expect(row.locator("td").nth(column("Reviews"))).toHaveText("0");

    // Your own role is not yours to change.
    const mine = page.locator("tr").filter({ hasText: organizer.email });
    await mine.getByRole("button", { name: "Manage" }).click();
    const myControls = page.getByRole("group", { name: `Manage ${organizer.name}` });
    await expect(myControls.getByRole("button", { name: "Remove organizer" })).toBeDisabled();
    // Nor is your own account yours to pause: it would shut you out of the
    // page you would need to undo it.
    await expect(myControls.getByRole("button", { name: "Pause this account" })).toBeDisabled();
    // Each control's label fits on one line of its button, and none of
    // them is pushed off the side of the table.
    const table = (await page.getByRole("table").boundingBox())!;
    for (const label of ["Set allowance", "Set password", "Pause this account"]) {
      const box = (await myControls.getByRole("button", { name: label }).boundingBox())!;
      expect(box.height).toBeLessThan(40);
      expect(box.x + box.width).toBeLessThanOrEqual(table.x + table.width);
    }
    await mine.getByRole("button", { name: "Close" }).click();
    await expect(myControls).toHaveCount(0);

    await row.getByRole("button", { name: "Manage" }).click();
    await page
      .getByRole("group", { name: `Manage ${participant.name}` })
      .getByRole("button", { name: "Make organizer" })
      .click();
    await expect(page.locator("tr").filter({ hasText: participant.email })).toContainText(
      "Organizer",
    );

    // Signing in afresh, they have the console.
    await participant.context.clearCookies();
    await signIn(participant.page, participant.email);
    await participant.page.goto("/admin");
    await expect(participant.page).toHaveURL(/\/admin$/);

    // The export carries both pieces of work, each saying which it is, the
    // frozen view of the submitted one, and the person's background answers.
    const draftEpisode = await episodeOf(draft);
    const lines = await exportLines(page);
    expect(lines.at(-1)!.record).toBe("end");
    const episodes = lines.filter(
      (l) => l.record === "episode" && [submitted.episodeId, draftEpisode].includes(l.episode_id as string),
    );
    expect(episodes.map((e) => e.status).sort()).toEqual(["draft", "submitted"]);
    const session = lines.find((l) => l.record === "session" && l.session_id === submitted.sessionId)!;
    expect(session.status).toBe("submitted");
    expect(session.messages as unknown[]).toHaveLength(2);
    const view = lines.find((l) => l.record === "review_view" && l.episode_id === submitted.episodeId)!;
    expect(JSON.stringify(view)).toContain("to: What is a virus?");
    const intake = lines.find((l) => l.record === "participant_intake" && l.email === participant.email)!;
    expect(intake.intake_version).toBe(INTAKE_VERSION);
    expect(lines.some((l) => l.record === "review_policy")).toBe(true);

    // Asked for submitted work only, the draft is left out.
    const only = await exportLines(page, "/api/admin/export?only=submitted");
    const mineOnly = only.filter((l) => l.record === "session" && l.user_id === session.user_id);
    expect(mineOnly.map((l) => l.session_id)).toEqual([submitted.sessionId]);

    await participant.context.close();
    await organizer.context.close();
  });

  test("reading everything one participant wrote, submitted or not", async ({ browser }) => {
    const participant = await newParticipant(browser, "Hana History");
    const p = participant.page;
    // One submitted, with a private goal note.
    const first = await startConversation(p, {
      provenance: "real",
      goal: "See how much detail it gives on misfolding.",
    });
    await say(p, "What is a prion?");
    await submitWork(p);
    // One never submitted.
    await startConversation(p);
    await say(p, "What is quorum sensing?");
    // And one opened and never typed into, which is not work.
    await startConversation(p);

    const organizer = await newOrganizer(browser, "Odile Organizer");
    const page = organizer.page;
    await page.goto("/admin/participants");
    await page.getByRole("link", { name: "Hana History" }).click();

    const work = page.getByRole("region", { name: "Work" });
    const one = work.locator("details").filter({ hasText: "What is a prion?" });
    const two = work.locator("details").filter({ hasText: "What is quorum sensing?" });
    await expect(work.getByRole("link", { name: "All (2)" })).toHaveAttribute("aria-current", "page");
    await expect(work.getByText(/1 was opened and never typed into/)).toBeVisible();

    // In full: every message, with what the author said about it.
    await expect(one).toContainText("Submitted");
    await expect(one).toContainText("to: What is a prion?");
    await expect(one).toContainText("Based on a real task");
    await expect(one).toContainText("See how much detail it gives on misfolding.");
    await expect(two).toContainText("Not submitted");
    await expect(two).toContainText("to: What is quorum sensing?");

    // Their background answers are on the same page.
    await expect(page.getByText("No specialized background in these areas")).toBeVisible();

    // Filtered either way.
    await work.getByRole("link", { name: "Submitted (1)", exact: true }).click();
    await expect(one).toBeVisible();
    await expect(two).toHaveCount(0);
    await work.getByRole("link", { name: "Not submitted (1)" }).click();
    await expect(two).toBeVisible();
    await expect(one).toHaveCount(0);

    expect(await episodeOf(first)).toBeTruthy();
    await participant.context.close();
    await organizer.context.close();
  });

  test("a submission waits until an organizer says who can review it", async ({ browser }) => {
    const author = await newParticipant(browser, "Avis Author", "author");
    await startConversation(author.page);
    await say(author.page, "ROUTED: what is a restriction enzyme?");
    await submitWork(author.page);
    const [{ title, id: episodeId }] = await sql`
      select e.title, e.id from episode e join "user" u on u.id = e.user_id
      where u.email = ${author.email}
    `;
    // Nothing else on offer, so what the reviewer gets is this.
    await sql`update episode set assignment_state = 'held' where assignment_state = 'ready'`;

    const organizer = await newOrganizer(browser, "Rory Router");
    const page = organizer.page;
    await page.goto("/admin/submissions");
    const card = page.getByRole("article").filter({ hasText: "Avis Author" });
    await expect(card).toContainText("Pending");
    await expect(card.getByRole("list", { name: "Review coverage" })).toContainText("0 of 3 reviewed");

    // A level that needs a subject is refused without one.
    await choose(page, "Review level", "Specialist", card);
    await choose(page, "Assignment state", "Ready", card);
    await card.getByRole("button", { name: "Save routing" }).click();
    await expect(card.getByRole("status")).toContainText(/subject/i);
    const [before] = await sql`select assignment_state, review_level from episode where id = ${episodeId}`;
    expect(before).toMatchObject({ assignment_state: "pending", review_level: null });

    // General, and out it goes.
    await choose(page, "Review level", "General", card);
    await card.getByRole("button", { name: "Save routing" }).click();
    await expect(card.getByRole("status")).toHaveText("Saved.");
    const [after] = await sql`select assignment_state, review_level from episode where id = ${episodeId}`;
    expect(after).toMatchObject({ assignment_state: "ready", review_level: "general" });

    const reviewer = await newReviewer(browser, "Rhys Reviewer");
    await getReview(reviewer.page);
    await expect(reviewer.page.getByText("to: ROUTED: what is a restriction enzyme?")).toBeVisible();

    // Held back while someone has it open: it is taken from them, and the
    // organizer is told that is what saving will do.
    await page.reload();
    const ready = page.getByRole("article").filter({ hasText: "Avis Author" });
    await expect(ready.getByRole("list", { name: "Review coverage" })).toContainText("1 in progress");
    await choose(page, "Assignment state", "Held", ready);
    await expect(ready.getByText(/1 reviewer has this open now/)).toBeVisible();
    await ready.getByRole("button", { name: "Save routing" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Taken back from 1 reviewer/ })).toBeVisible();

    await reviewer.page.reload();
    await expect(reviewer.page.getByText("Your hold on this one ran out")).toBeVisible();
    expect(title).toBeTruthy();

    for (const person of [author, organizer, reviewer]) await person.context.close();
  });

  test("everything waiting can be released at once", async ({ browser }) => {
    const author = await newParticipant(browser, "Bulk Betty", "author");
    const one = await submittedConversation(author.page, "First to release?");
    const two = await submittedConversation(author.page, "Second to release?");
    const organizer = await newOrganizer(browser, "Rita Releases");
    const page = organizer.page;

    await page.goto("/admin/submissions");
    await page.getByRole("button", { name: /^Release all pending as General \(\d+\)$/ }).click();
    await page.getByRole("button", { name: /^Yes, release \d+$/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Released \d+ submissions? for review\./ })).toBeVisible();

    const rows = await sql`
      select review_level, assignment_state from episode where id in ${sql([one.episodeId, two.episodeId])}
    `;
    expect(rows).toEqual([
      { review_level: "general", assignment_state: "ready" },
      { review_level: "general", assignment_state: "ready" },
    ]);
    await author.context.close();
    await organizer.context.close();
  });

  test("publishing a policy version makes reviewers read the instruction again", async ({
    browser,
  }) => {
    const author = await newParticipant(browser, "Nora Norules", "author");
    const { episodeId } = await submittedConversation(author.page, "Reviewed without a rule?");
    const reviewer = await newParticipant(browser, "Vera Versioned", "reviewer");
    await passInstructionCheck(reviewer.email);
    await reviewer.page.goto("/review");
    await expect(reviewer.page.getByRole("button", { name: "Get a review" })).toBeVisible();

    const organizer = await newOrganizer(browser, "Paula Policy");
    const page = organizer.page;
    const [{ max: before }] = await sql`select max(version)::int as max from review_policy`;
    const next = before + 1;
    const marker = `Policy written by a test at ${Date.now()}.`;

    try {
      await page.goto("/admin/policy");
      const body = page.getByLabel(`Policy text, version ${next}`);
      const rules = page.getByLabel("Rules reviewers can cite");
      await body.fill(`# A newer policy\n\n${marker}`);

      // Rules under which nobody could answer Yes are refused.
      await rules.fill("N1 | Ordinary education | no");
      await page.getByRole("button", { name: `Publish as version ${next}` }).click();
      await expect(page.getByRole("status")).toContainText(/yes/i);

      // No rules at all is fine: the text is the policy.
      await rules.fill("");
      await page.getByRole("button", { name: `Publish as version ${next}` }).click();
      await expect(page.getByText(/No rules: reviewers will not be asked/)).toBeVisible();
      await page.getByRole("button", { name: `Yes, publish version ${next}` }).click();
      await expect(page.getByText(`Version ${next} is in force`)).toBeVisible();

      // The reviewer, who had passed the check for the old version, is asked again.
      await reviewer.page.reload();
      await expect(reviewer.page.getByRole("heading", { name: "A newer policy" })).toBeVisible();
      await expect(reviewer.page.getByText(marker)).toBeVisible();
      await expect(reviewer.page.getByRole("button", { name: "Get a review" })).toHaveCount(0);
      await expect(reviewer.page.getByRole("button", { name: "Check my answers" })).toBeVisible();

      // Under a policy with no rules, the form does not ask for a criterion.
      await passInstructionCheck(reviewer.email);
      await sql`update episode set assignment_state = 'held' where assignment_state = 'ready'`;
      await release(episodeId);
      const assignmentId = await getReview(reviewer.page);
      await expect(reviewForm(reviewer.page).getByText("Which criterion supports your answer?")).toHaveCount(0);
      await fillReview(reviewer.page, {
        verdict: "No",
        basis: null,
        confidence: "High",
        turns: [],
        rationale: "Nothing in it of the kind the policy describes.",
      });
      await submitReview(reviewer.page);
      const [stored] = await sql`
        select policy_basis, policy_version, verdict from review_response
        where assignment_id = ${assignmentId}
      `;
      expect(stored).toMatchObject({ policy_basis: "not_asked", policy_version: next, verdict: "no" });
    } finally {
      // Put the policy back behind the app's back, and wait for its copy to expire.
      await sql`delete from review_policy where version > ${before}`;
      await page.waitForTimeout(SETTINGS_TTL_MS + 500);
      for (const person of [author, reviewer, organizer]) await person.context.close();
    }
  });

  test("the review settings are changed from the console", async ({ browser }) => {
    const { page, context } = await newOrganizer(browser, "Sam Settings");
    await page.goto("/admin/settings");
    await page.getByLabel("Reviews per view").fill("2");
    await page.getByRole("checkbox", { name: "Release new submissions for review automatically" }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect
      .poll(async () => {
        const [row] = await sql`
          select reviews_per_view, auto_release_submissions from event_settings where id = 1
        `;
        return row;
      })
      .toMatchObject({ reviews_per_view: 2, auto_release_submissions: true });

    // With automatic release on, a new submission needs nobody's attention.
    const author = await newParticipant(browser, "Auto Anna", "author");
    const { episodeId } = await submittedConversation(author.page, "Released without anyone?");
    const [row] = await sql`select review_level, assignment_state from episode where id = ${episodeId}`;
    expect(row).toMatchObject({ review_level: "general", assignment_state: "ready" });
    await author.context.close();
    await context.close();
  });

  test("a closing time means the same on any laptop", async ({ browser }) => {
    const organizer = await newOrganizer(browser, "Tokyo Tess");
    // This organizer's laptop is on Tokyo time; the event is not.
    const context = await browser.newContext({
      timezoneId: "Asia/Tokyo",
      storageState: await organizer.context.storageState(),
    });
    const page = await context.newPage();
    const typed = "2030-11-14T15:00";
    const instant = fromEventInputValue(typed)!;

    try {
      await page.goto("/admin/nominations");
      const field = page.getByLabel(/Closing time/);
      await field.fill(typed);
      await page.getByRole("button", { name: "Set closing time" }).click();
      await expect(page.getByText(`close at ${formatEventDateTime(instant)}`)).toBeVisible();

      // Stored as the instant that is 3pm in Boston.
      await expect
        .poll(async () => {
          const [row] = await sql`select nominations_close_at from event_settings where id = 1`;
          return (row.nominations_close_at as Date | null)?.toISOString();
        })
        .toBe(instant.toISOString());

      // Read back, it is still 15:00, and saving it again does not move it.
      await page.reload();
      await expect(page.getByLabel(/Closing time/)).toHaveValue(typed);
      await page.getByRole("button", { name: "Set closing time" }).click();
      await page.reload();
      await expect(page.getByLabel(/Closing time/)).toHaveValue(typed);

      // Participants are told the same time, with its zone.
      await page.goto("/nominate");
      await expect(page.getByText(`Nominations close at ${formatEventDateTime(instant)}`)).toBeVisible();
    } finally {
      await page.goto("/admin/nominations");
      await page.getByLabel(/Closing time/).fill("");
      await page.getByRole("button", { name: "Clear closing time" }).click();
      await expect(page.getByText("No closing time is set.")).toBeVisible();
      await context.close();
      await organizer.context.close();
    }
  });

  test("a closing time that has already passed is refused", async ({ browser }) => {
    const { page, context } = await newOrganizer(browser, "Yesterday Yara");
    await page.goto("/admin/nominations");
    await page.getByLabel(/Closing time/).fill("2020-01-01T15:00");
    await page.getByRole("button", { name: "Set closing time" }).click();

    await expect(page.getByText("That time has already passed")).toBeVisible();
    const [row] = await sql`select nominations_close_at from event_settings where id = 1`;
    expect(row.nominations_close_at).toBeNull();

    // And participants are not shut out.
    await page.goto("/nominate");
    await expect(page.getByText("Nominations are closed.")).toHaveCount(0);
    await context.close();
  });

  test("an unreadable allowance is refused, not stored as zero", async ({ browser }) => {
    const { page, context } = await newOrganizer(browser, "Numbers Ned");
    const stored = async () => {
      const [row] = await sql`select default_daily_token_budget from event_settings where id = 1`;
      return Number(row.default_daily_token_budget);
    };
    const before = await stored();

    try {
      await page.goto("/admin/settings");
      const allowance = page.getByLabel("Daily token allowance per participant");

      for (const nonsense of ["abc", "", "0"]) {
        await allowance.fill(nonsense);
        await page.getByRole("button", { name: "Save settings" }).click();
        await expect(page.getByText("Nothing was saved.")).toBeVisible();
        expect(await stored()).toBe(before);
      }

      // Written the way the console itself displays it.
      await allowance.fill("4,000,000");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();
      await expect.poll(stored).toBe(4_000_000);
    } finally {
      await sql`update event_settings set default_daily_token_budget = ${before} where id = 1`;
      await context.close();
    }
  });
});
