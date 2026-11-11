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

  test("the briefing, with every prize and deadline, is there once signed in", async ({
    browser,
  }) => {
    const { page, context } = await newParticipant(browser, "Gina Guide");
    await page.goto("/guide");

    await expect(page.getByRole("heading", { name: "How today works", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you will be doing" })).toBeVisible();

    // All five prize tracks, each with its deadline.
    const prizes = page.getByRole("table");
    for (const track of [
      "Adversarial use cases",
      "Dual-use use cases",
      "Linked or collaborative",
      "Benign transcripts",
      "Independent reviewer",
    ]) {
      await expect(prizes.getByRole("row").filter({ hasText: track })).toBeVisible();
    }
    await expect(prizes.getByRole("row").filter({ hasText: "Benign transcripts" })).toContainText(
      "16:00",
    );
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
