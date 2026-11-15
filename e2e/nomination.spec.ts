import { expect, test } from "@playwright/test";
import { sql, userId } from "./db";
import { newParticipant } from "./helpers";

test.describe("putting work forward", () => {
  test("an entry, saved and listed", async ({ browser }) => {
    const { page, context, email } = await newParticipant(browser, "Nico Nominator", "nominator");

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

    // A link saved while the form still asked for one is not cleared by a later edit.
    const mine = await userId(email);
    await sql`
      update nomination set slides_url = 'https://example.com/slides'
      where user_id = ${mine} and track = 'comparative'
    `;
    await page.getByLabel("Headline finding").fill("Two scanners disagree, usefully");
    await page.getByRole("button", { name: "Update entry" }).click();
    await expect
      .poll(
        async () =>
          (await sql`select headline, slides_url from nomination where user_id = ${mine} and track = 'comparative'`)[0],
      )
      .toMatchObject({
        headline: "Two scanners disagree, usefully",
        slides_url: "https://example.com/slides",
      });

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
