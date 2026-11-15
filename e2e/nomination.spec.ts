import { expect, test } from "@playwright/test";
import { newParticipant } from "./helpers";

test.describe("putting work forward", () => {
  test("an entry, with a link to slides, saved and listed", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Nico Nominator", "nominator");

    // Two tracks are decided by nomination. There used to be a third.
    await page.goto("/nominate");
    await expect(page.getByRole("link", { name: /Adversarial use cases/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Dual-use use cases/ })).toBeVisible();
    await expect(page.getByText(/collaborat/i)).toHaveCount(0);
    const gone = await page.request.get("/nominate/collaborative");
    expect(gone.status()).toBe(404);

    await page.goto("/nominate/dual_use");
    await page.getByLabel("Headline finding").fill("Two scanners disagree in a useful way");
    await page
      .getByLabel("The finding in detail")
      .fill("Compared both scanners across my transcripts; the disagreements were the signal.");
    // No question about collaborators any more.
    await expect(page.getByText(/work with/i)).toHaveCount(0);

    // A link that is not a link is refused, and nothing typed is lost.
    await page.getByLabel("Link to slides (optional)").fill("my slides");
    await page.getByRole("button", { name: "Submit nomination" }).click();
    await expect(page.getByText("That does not look like a link.")).toBeVisible();
    await expect(page.getByLabel("Headline finding")).toHaveValue(
      "Two scanners disagree in a useful way",
    );
    await page.getByLabel("Link to slides (optional)").fill("https://example.com/slides");
    await page.getByRole("button", { name: "Submit nomination" }).click();
    await expect(page.getByRole("button", { name: "Update entry" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Headline finding")).toHaveValue(
      "Two scanners disagree in a useful way",
    );
    await expect(page.getByLabel("Link to slides (optional)")).toHaveValue(
      "https://example.com/slides",
    );

    // And the track list shows it as entered.
    await page.goto("/nominate");
    await expect(page.getByRole("link", { name: /Dual-use use cases/ })).toContainText(
      "Submitted",
    );
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
