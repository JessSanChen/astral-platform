import { expect, test } from "@playwright/test";
import { newParticipant } from "./helpers";

test.describe("putting work forward", () => {
  test("an entry, saved and listed", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Nico Nominator", "nominator");

    // Three awards are decided by nomination. The earlier tracks are gone.
    await page.goto("/nominate");
    // The page does not say how many there are, since that changes.
    await expect(page.getByText(/prize tracks are decided by nomination/)).toHaveCount(0);
    for (const award of [
      /Most Interesting AI Risk Finding/,
      /Best Comparative Investigation/,
      /Best Multi-Session Investigation/,
    ]) {
      await expect(page.getByRole("link", { name: award })).toBeVisible();
    }
    await expect(page.getByText(/collaborat|Adversarial use cases|Dual-use use cases/i)).toHaveCount(0);
    for (const retired of ["collaborative", "adversarial", "dual_use"]) {
      expect((await page.request.get(`/nominate/${retired}`)).status(), retired).toBe(404);
    }

    await page.goto("/nominate/comparative");
    // The award's own question is at the top of its form.
    await expect(page.getByText(/What changes the result\? The focus is a meaningful comparison/)).toBeVisible();
    await page.getByLabel("Headline finding").fill("Two scanners disagree in a useful way");
    await page
      .getByLabel("The finding in detail")
      .fill("Compared both scanners across my transcripts; the disagreements were the signal.");
    // No question about collaborators any more.
    await expect(page.getByText(/work with/i)).toHaveCount(0);

    // No link to slides is asked for.
    await expect(page.getByLabel(/Link to slides/)).toHaveCount(0);
    await page.getByRole("button", { name: "Submit nomination" }).click();
    await expect(page.getByRole("button", { name: "Update entry" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Headline finding")).toHaveValue(
      "Two scanners disagree in a useful way",
    );

    // And the track list shows it as entered.
    await page.goto("/nominate");
    await expect(page.getByRole("link", { name: /Best Comparative Investigation/ })).toContainText(
      "Submitted",
    );
    await context.close();
  });

  test("an entry with nothing in it is refused", async ({ browser }) => {
    const { page, context } = await newParticipant(browser, "Blank Bella", "nominator");
    await page.goto("/nominate/ai_risk_finding");
    await page.getByLabel("Headline finding").fill("   ");
    await page.getByLabel("The finding in detail").fill("   ");
    await page.getByRole("button", { name: "Submit nomination" }).click();
    await expect(page.getByText("Give your finding a headline.")).toBeVisible();
    await expect(page.getByText("Describe the finding.")).toBeVisible();
    await context.close();
  });
});
