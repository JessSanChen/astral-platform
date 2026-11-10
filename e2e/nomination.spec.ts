import { expect, test } from "@playwright/test";
import { newParticipant } from "./helpers";

test.describe("putting work forward", () => {
  test("a collaborative entry, with collaborators picked and typed", async ({ browser }) => {
    const partner = await newParticipant(browser, "Petra Partner", "partner");
    const { page, context } = await newParticipant(browser, "Nico Nominator", "nominator");

    await page.goto("/nominate/collaborative");
    await page.getByLabel("Headline finding").fill("Two scanners disagree in a useful way");
    await page
      .getByLabel("The finding in detail")
      .fill("We compared both scanners across our transcripts and the disagreements were the signal.");

    // Typing finds the participant; Enter adds them as a chip.
    const who = page.getByLabel("Who did you work with?");
    await who.fill("Petra");
    await expect(page.getByRole("option", { name: "Petra Partner" })).toBeVisible();
    await page.keyboard.press("Enter");
    // Someone who is not on the list can still be named.
    await who.fill("Someone Offsite");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Remove Petra Partner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Someone Offsite" })).toBeVisible();

    // Straight to submit: the suggestions must not be in the way.
    await page.getByRole("button", { name: "Submit nomination" }).click();
    await expect(page.getByRole("button", { name: "Update entry" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Headline finding")).toHaveValue(
      "Two scanners disagree in a useful way",
    );
    await expect(page.getByRole("button", { name: "Remove Petra Partner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Someone Offsite" })).toBeVisible();

    // And the track list shows it as entered.
    await page.goto("/nominate");
    await expect(
      page.getByRole("link").filter({ hasText: "Linked or collaborative" }),
    ).toContainText("Submitted");

    await partner.context.close();
    await context.close();
  });

  test("an entry with nothing in it is refused", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Blank Bella", "nominator");
    await page.goto("/nominate/adversarial");
    await page.getByLabel("Headline finding").fill("   ");
    await page.getByLabel("The finding in detail").fill("   ");
    await page.getByRole("button", { name: "Submit nomination" }).click();
    await expect(page.getByText("Give your finding a headline.")).toBeVisible();
    await expect(page.getByText("Describe the finding.")).toBeVisible();
    await context.close();
  });
});
