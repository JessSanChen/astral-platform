import { expect, test } from "@playwright/test";
import { newParticipant } from "./helpers";

test.describe("the front page", () => {
  test("introduces the day and shows the way in, and nothing more", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Astral", level: 1 })).toBeVisible();
    await expect(page.getByText("You will need the event code from the organizers.")).toBeVisible();

    // The models on offer come from the event's settings, not from the page.
    await expect(page.getByText("Models available today")).toBeVisible();

    // The briefing lives behind sign-in now: no prize table, no sections.
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);

    await page.getByRole("link", { name: "Create account" }).first().click();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test("the briefing describes the day as it now runs, once signed in", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Gina Guide");
    await page.goto("/guide");

    await expect(page.getByRole("heading", { name: "How today works", level: 1 })).toBeVisible();
    for (const section of [
      "Why we are doing this",
      "What you will be doing",
      "Prizes",
      "What happens to what you write",
    ]) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }
    // The awards are listed; nothing that no longer exists is promised.
    await expect(page.getByRole("table").getByRole("row")).not.toHaveCount(1);
    const main = page.getByRole("main");
    await expect(main.getByText(/collaborat/i)).toHaveCount(0);
    // Five awards: two counted, three entered by nomination.
    const awards = page.getByRole("table");
    await expect(awards.getByRole("row")).toHaveCount(6);
    for (const award of [
      "Most Qualified Transcripts",
      "Most Qualified Reviews",
      "Most Interesting AI Risk Finding",
      "Best Comparative Investigation",
      "Best Multi-Session Investigation",
    ]) {
      await expect(awards.getByRole("row").filter({ hasText: award })).toBeVisible();
    }
    await expect(main.getByText(/Adversarial use cases|Dual-use use cases/)).toHaveCount(0);
    await expect(main.getByText("What changes the result?", { exact: false })).toBeVisible();

    // The infohazard guide is one click away, here and in the menu.
    await main.getByRole("link", { name: "infohazard guide" }).click();
    await expect(page).toHaveURL(/\/infohazards$/);
    await expect(page.getByRole("heading", { name: "Infohazard guide", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The three rules" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Screenshots, photos, copying" })).toContainText(
      "Never",
    );
    await expect(page.getByRole("link", { name: "Infohazard guide" })).toHaveAttribute(
      "href",
      "/infohazards",
    );

    // The way to nominate is in the menu.
    await page.getByRole("link", { name: "Submit", exact: true }).click();
    await expect(page).toHaveURL(/\/nominate$/);
    await context.close();
  });

  test("every page says which commit it was built from", async ({ page }) => {
    await page.goto("/sign-in");
    const build = page.locator('meta[name="astral-build"]');
    await expect(build).toHaveAttribute("content", /^([0-9a-f]{7}|local)$/);
  });

  test("the in-app copy of the briefing asks a visitor to sign in first", async ({ page }) => {
    await page.goto("/guide");
    // Signed out, the in-app copy sends you to sign in rather than showing.
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
