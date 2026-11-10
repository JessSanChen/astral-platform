import { expect, test } from "@playwright/test";
import { formatEventDateTime, fromEventInputValue } from "@/lib/time";
import { sql } from "./db";
import { newOrganizer, newParticipant, signIn, submittedTranscript } from "./helpers";

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
    await expect(mine.getByRole("button", { name: "Remove organizer" })).toBeDisabled();
    await mine.getByRole("button", { name: "Close" }).click();

    await row.getByRole("button", { name: "Manage" }).click();
    await row.getByRole("button", { name: "Make organizer" }).click();
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
    expect(theirs.messages).toHaveLength(2);

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
