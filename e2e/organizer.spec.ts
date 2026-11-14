import { expect, test } from "@playwright/test";
import { formatEventDateTime, fromEventInputValue } from "@/lib/time";
import { sql } from "./db";
import {
  choose,
  labelsPanel,
  newOrganizer,
  newParticipant,
  say,
  signIn,
  startConversation,
  submittedTranscript,
} from "./helpers";

test.describe("the organizer console", () => {
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
    await submittedTranscript(participant.page, "What is a virus?", { type: "Benign" });
    // One more exchange after submitting, never submitted.
    await say(participant.page, "And what is a bacteriophage?");
    const organizer = await newOrganizer(browser);
    const page = organizer.page;

    await page.goto("/admin/participants");
    const row = page.locator("tr").filter({ hasText: participant.email });
    await expect(row).toContainText("Active");
    // Benign, dual use, adversarial, submitted: one benign transcript.
    await expect(row.locator("td").nth(1)).toHaveText("1");
    await expect(row.locator("td").nth(4)).toHaveText("1");

    // Your own role is not yours to change.
    const mine = page.locator("tr").filter({ hasText: organizer.email });
    await mine.getByRole("button", { name: "Manage" }).click();
    const myControls = page.getByRole("group", { name: `Manage ${organizer.name}` });
    await expect(myControls.getByRole("button", { name: "Remove organizer" })).toBeDisabled();
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

    // The export carries the transcript, labelled as submitted.
    const lines = (await (await page.request.get("/api/admin/export")).text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const theirs = lines.find(
      (l) => l.record === "transcript" && l.author?.email === participant.email,
    );
    expect(theirs.self_labels.type).toBe("benign");
    // All four messages are there, and marked: the labels describe two.
    expect(theirs.messages).toHaveLength(4);
    expect(theirs.submitted_message_count).toBe(2);
    expect(theirs.messages.map((m: { in_submitted_version: boolean }) => m.in_submitted_version)).toEqual([
      true,
      true,
      false,
      false,
    ]);

    await participant.context.close();
    await organizer.context.close();
  });

  test("reading everything one participant wrote, submitted or not", async ({ browser }) => {
    const participant = await newParticipant(browser, "Hana History");
    const p = participant.page;
    // One submitted, with a later message that never was.
    const submitted = await submittedTranscript(p, "What is a prion?", {
      type: "Dual use",
      goal: "See how much detail it gives on misfolding.",
    });
    await say(p, "And how are they inactivated?");
    // One never submitted, with labels half filled in.
    const draft = await startConversation(p);
    await say(p, "What is quorum sensing?");
    await choose(p, "What kind of transcript is this?", "Benign", labelsPanel(p));
    await labelsPanel(p).getByRole("button", { name: "Save" }).click();
    await expect(labelsPanel(p)).toContainText("Progress saved.");
    // And one opened and never typed into, which is not a transcript.
    await startConversation(p);

    const organizer = await newOrganizer(browser, "Odile Organizer");
    const page = organizer.page;
    await page.goto("/admin/participants");
    await page.getByRole("link", { name: "Hana History" }).click();

    // Both conversations, in full: every message, not a preview.
    const one = page.locator("details").filter({ hasText: "What is a prion?" });
    const two = page.locator("details").filter({ hasText: "What is quorum sensing?" });
    await expect(page.getByRole("link", { name: "All (2)" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("1 conversation was opened and never typed into")).toBeVisible();
    await expect(one).toContainText("Submitted v1");
    await expect(one).toContainText("to: What is a prion?");
    await expect(one).toContainText("And how are they inactivated?");
    await expect(one.getByText("added after submitting, not part of it")).toHaveCount(2);

    // Beside it, the labels as they were submitted.
    await expect(one).toContainText("Labels, as submitted");
    await expect(one).toContainText("Dual use");
    await expect(one).toContainText("See how much detail it gives on misfolding.");
    await expect(one).toContainText("2 later messages not submitted");

    // The one never submitted says so, and shows what had been filled in.
    await expect(two).toContainText("Not submitted");
    await expect(two).toContainText("Labels so far (not submitted)");
    await expect(two).toContainText("Benign");
    await expect(two).toContainText("to: What is quorum sensing?");

    // Filtered either way.
    await page.getByRole("link", { name: "Submitted (1)", exact: true }).click();
    await expect(one).toBeVisible();
    await expect(two).toHaveCount(0);
    await page.getByRole("link", { name: "Not submitted (1)" }).click();
    await expect(two).toBeVisible();
    await expect(one).toHaveCount(0);

    // The export has both, each saying which it is, and can leave the
    // unsubmitted ones out.
    const read = async (path: string) =>
      (await (await page.request.get(path)).text())
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l))
        .filter((l) => l.author?.email === participant.email);
    const everything = await read("/api/admin/export");
    expect(everything.map((l) => [l.conversation_id, l.status]).sort()).toEqual(
      [
        [draft, "draft"],
        [submitted, "submitted"],
      ].sort(),
    );
    const unsubmitted = everything.find((l) => l.conversation_id === draft);
    expect(unsubmitted.self_labels).toBeNull();
    expect(unsubmitted.draft_labels.type).toBe("benign");
    expect(unsubmitted.messages).toHaveLength(2);
    const onlySubmitted = await read("/api/admin/export?only=submitted");
    expect(onlySubmitted.map((l) => l.conversation_id)).toEqual([submitted]);

    await participant.context.close();
    await organizer.context.close();
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
