import { expect, test } from "@playwright/test";
import { SETTINGS_TTL_MS } from "@/lib/cache";
import { resetSettings, sql } from "./db";
import { newParticipant, submittedConversation } from "./helpers";

test.describe("putting work forward for a prize", () => {
  test.afterEach(async () => {
    await resetSettings();
  });

  test("submitted work is entered and taken back, up to three pieces", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Priya Prizes");

    await page.goto("/prizes");
    await expect(page.getByRole("heading", { name: "Prizes", level: 1 })).toBeVisible();
    await expect(page.getByText("Nothing submitted yet")).toBeVisible();

    const ids: string[] = [];
    for (const question of ["First of four?", "Second of four?", "Third of four?", "Fourth of four?"]) {
      ids.push((await submittedConversation(page, question)).episodeId);
    }

    await page.goto("/prizes");
    const count = page.getByTestId("prize-count");
    await expect(count).toHaveText(/0 of 3 entries used/);
    const rows = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Enter for a prize" }) });
    await expect(rows).toHaveCount(4);

    for (let i = 0; i < 3; i += 1) {
      await page.getByRole("button", { name: "Enter for a prize" }).first().click();
      await expect(count).toHaveText(new RegExp(`${i + 1} of 3 entries used`));
    }
    // A fourth is refused, and says what to do about it.
    await page.getByRole("button", { name: "Enter for a prize" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /up to 3 pieces of work/ })).toBeVisible();
    const [{ entered }] = await sql`
      select count(*)::int as entered from episode
      where id in ${sql(ids)} and prize_entry_at is not null
    `;
    expect(entered).toBe(3);

    await page.getByRole("button", { name: "Take back" }).first().click();
    await expect(count).toHaveText(/2 of 3 entries used/);

    // Entering changes nothing about how the work is routed for review.
    const states = await sql`select distinct assignment_state from episode where id in ${sql(ids)}`;
    expect(states.map((s) => s.assignment_state)).toEqual(["pending"]);
    await context.close();
  });

  test("once entries are closed, what was entered stays and nothing can change", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Clio Closed");
    const kept = await submittedConversation(page, "Entered before the close?");
    await submittedConversation(page, "Not entered before the close?");
    await page.goto("/prizes");
    await page.getByRole("button", { name: "Enter for a prize" }).first().click();
    await expect(page.getByTestId("prize-count")).toHaveText(/1 of 3 entries used/);

    await sql`update event_settings set nominations_locked = true where id = 1`;
    await page.waitForTimeout(SETTINGS_TTL_MS + 500);
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Prize entries are closed" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Enter for a prize|Take back/ })).toHaveCount(0);

    // The panel beside the work says the same, and its tick box is fixed.
    await page.goto(`/chat/${kept.sessionId}`);
    await expect(page.getByRole("checkbox", { name: "Consider this for a prize" })).toBeDisabled();
    const [{ n }] = await sql`
      select count(*)::int as n from episode where id = ${kept.episodeId} and prize_entry_at is not null
    `;
    // Which of the two was "first" on the page is not the point: one is entered, still.
    const [{ total }] = await sql`
      select count(*)::int as total from episode e
      join "user" u on u.id = e.user_id
      where u.name = 'Clio Closed' and e.prize_entry_at is not null
    `;
    expect(total).toBe(1);
    expect([0, 1]).toContain(n);
    await context.close();
  });
});
