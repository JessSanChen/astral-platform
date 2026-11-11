import { expect, test } from "@playwright/test";
import { SETTINGS_TTL_MS } from "@/lib/cache";
import { DEFAULT_MODELS } from "@/lib/models";
import { sql } from "./db";
import { newOrganizer, newParticipant, say, startConversation } from "./helpers";

/**
 * The controls an organizer reaches for during the event, each checked from
 * the participant's side as well: what matters is what the room sees.
 */
test.describe("running the day", () => {
  test("pausing chat stops everyone, and resuming lets them carry on", async ({ browser }) => {
    const participant = await newParticipant(browser, "Paula Paused");
    const organizer = await newOrganizer(browser, "Otto Organizer");
    await startConversation(participant.page);
    await say(participant.page, "A question before the pause.");

    try {
      await organizer.page.goto("/admin");
      await organizer.page.getByRole("button", { name: "Pause chat for everyone" }).click();
      await expect(
        organizer.page.getByRole("button", { name: "Resume chat for everyone" }),
      ).toBeVisible();

      // The very next message is turned away, and told why. On one server
      // a pause is immediate; it is only other servers that take a moment.
      const composer = participant.page.getByPlaceholder("Send a message...");
      await composer.fill("A question during the pause.");
      await composer.press("Enter");
      await expect(
        participant.page.getByText("An organizer has paused chat for everyone."),
      ).toBeVisible();
      await expect(participant.page.getByText("to: A question during the pause.")).toHaveCount(0);

      await organizer.page.getByRole("button", { name: "Resume chat for everyone" }).click();
      await expect(
        organizer.page.getByRole("button", { name: "Pause chat for everyone" }),
      ).toBeVisible();

      await say(participant.page, "A question after the pause.");
    } finally {
      await sql`update event_settings set chat_paused = false where id = 1`;
      await participant.context.close();
      await organizer.context.close();
    }
  });

  test("closing nominations by hand freezes entries, and reopening frees them", async ({
    browser,
  }) => {
    const participant = await newParticipant(browser, "Nell Nominee");
    const organizer = await newOrganizer(browser, "Olga Organizer");
    const page = participant.page;

    await page.goto("/nominate/adversarial");
    await page.getByLabel("Headline finding").fill("Entered before the close");
    await page.getByLabel("The finding in detail").fill("Enough detail to be an entry.");
    await page.getByRole("button", { name: "Submit nomination" }).click();
    await expect(page.getByRole("button", { name: "Update entry" })).toBeVisible();

    try {
      await organizer.page.goto("/admin/nominations");
      await organizer.page.getByRole("button", { name: "Close nominations now" }).click();
      await expect(
        organizer.page.getByRole("button", { name: "Reopen nominations" }),
      ).toBeVisible();

      // The entry can still be read, and no longer changed.
      await page.goto("/nominate");
      await expect(page.getByText("Nominations are closed.")).toBeVisible();
      await page.goto("/nominate/adversarial");
      await expect(page.getByLabel("Headline finding")).toHaveValue("Entered before the close");
      await expect(page.getByLabel("Headline finding")).toBeDisabled();
      await expect(page.getByRole("button", { name: /Update entry|Submit nomination/ })).toHaveCount(0);

      // A track not yet entered cannot be entered now.
      await page.goto("/nominate/dual_use");
      await expect(page.getByText("No entry was submitted for this track.")).toBeVisible();
      await expect(page.getByLabel("Headline finding")).toBeDisabled();

      await organizer.page.getByRole("button", { name: "Reopen nominations" }).click();
      await expect(
        organizer.page.getByRole("button", { name: "Close nominations now" }),
      ).toBeVisible();

      await page.goto("/nominate/adversarial");
      await page.getByLabel("Headline finding").fill("Changed after reopening");
      await page.getByRole("button", { name: "Update entry" }).click();
      await expect(page.getByText("Saved. You can change this until nominations close.")).toBeVisible();
    } finally {
      await sql`update event_settings set nominations_locked = false where id = 1`;
      await participant.context.close();
      await organizer.context.close();
    }
  });

  test("publishing new terms asks everyone to accept them, once", async ({ browser }) => {
    const participant = await newParticipant(browser, "Tess Terms");
    const organizer = await newOrganizer(browser, "Oscar Organizer");
    // The participant is in the middle of a conversation when it happens.
    await startConversation(participant.page);
    await say(participant.page, "A question before the terms change.");
    const [{ max: before }] = await sql`select max(version)::int as max from terms_version`;
    const marker = `Terms written by a test at ${Date.now()}.`;
    const text = `# Terms for the test\n\n${marker}\n\n- You agree to the new thing.`;

    try {
      const admin = organizer.page;
      await admin.goto("/admin/terms");
      await expect(admin.getByText(`Version ${before} is in force`)).toBeVisible();

      // Unchanged text cannot be published.
      const publish = admin.getByRole("button", { name: `Publish as version ${before + 1}` });
      await expect(publish).toBeDisabled();

      await admin.getByLabel(`Text of version ${before + 1}`).fill(text);
      // What participants will see is shown as it is written.
      await expect(admin.getByRole("heading", { name: "Terms for the test" })).toBeVisible();
      await publish.click();
      // It asks first, saying who will be interrupted.
      await expect(admin.getByText("It cannot be edited or withdrawn")).toBeVisible();
      await admin.getByRole("button", { name: `Yes, publish version ${before + 1}` }).click();
      await expect(admin.getByText(`Version ${before + 1} is in force`)).toBeVisible();
      await expect(admin.getByText("Every version")).toBeVisible();

      // The participant has not moved. Their next message is refused, for
      // the right reason, with the way forward in front of them.
      const page = participant.page;
      const composer = page.getByPlaceholder("Send a message...");
      await composer.fill("A question after the terms change.");
      await composer.press("Enter");
      await expect(page.getByText("The terms have been updated.")).toBeVisible();
      await expect(page.getByText("Finish your profile")).toHaveCount(0);
      await expect(page.getByText("Your message is still saved")).toHaveCount(0);
      await page.getByRole("link", { name: "Read and accept the updated terms" }).click();
      await page.waitForURL("**/onboarding");
      await expect(page.getByRole("heading", { name: "Updated terms" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Terms for the test" })).toBeVisible();
      await expect(page.getByText(marker)).toBeVisible();
      // Only the terms: their profile is not asked for again.
      await expect(page.getByLabel("Affiliation")).toHaveCount(0);

      // Accepting needs the box ticked.
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText("You must accept the terms to continue.")).toBeVisible();

      await page.getByRole("checkbox", { name: /I have read and agree/ }).check();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/chat");

      // And that is the end of it: the next pages do not ask again.
      await page.goto("/review");
      await expect(page).toHaveURL(/\/review$/);
      await page.goto("/profile");
      await expect(page.getByText(`Version ${before + 1} on`)).toBeVisible();
    } finally {
      // Put the terms back, so the next sign-up is asked for the version it
      // was before this test. Deleting it here goes behind the app's back,
      // so the app goes on believing in the deleted version until its copy
      // expires, and a sign-up inside that window would be told the terms
      // had changed under it. Wait the window out.
      await sql`delete from terms_version where version > ${before}`;
      await participant.page.waitForTimeout(SETTINGS_TTL_MS + 500);
      await participant.context.close();
      await organizer.context.close();
    }
  });

  test("taking the model list that came with a new version of the app", async ({ browser }) => {
    const organizer = await newOrganizer(browser, "Odette Organizer");
    const page = organizer.page;
    const [{ enabled_models: original }] =
      await sql`select enabled_models from event_settings where id = 1`;
    // An event set up with an older version: one model that has since been
    // dropped, and the newest one missing.
    const retired = {
      id: "old/retired-model",
      displayName: "Retired Model 1",
      family: "open",
      sort: 99,
      enabled: true,
    };
    const older = [...DEFAULT_MODELS.slice(1), retired];

    try {
      await sql`update event_settings set enabled_models = ${sql.json(older)} where id = 1`;
      await page.goto("/admin/settings");
      // Saving the settings makes the server read them afresh, so the test
      // does not wait out the few seconds they are remembered for.
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();

      // It says exactly what would change before anything does.
      await expect(page.getByText("This version of the app comes with a different list.")).toBeVisible();
      await expect(page.getByText(`Would add: ${DEFAULT_MODELS[0].displayName}.`)).toBeVisible();
      await expect(page.getByText("Would remove: Retired Model 1.")).toBeVisible();

      await page.getByRole("button", { name: "Switch to the new list" }).click();
      // Nothing left to offer once the lists match.
      await expect(page.getByText("This version of the app comes with a different list.")).toHaveCount(0);
      await expect(page.getByText("Retired Model 1")).toHaveCount(0);

      const [{ enabled_models: now }] =
        await sql`select enabled_models from event_settings where id = 1`;
      expect((now as { id: string }[]).map((m) => m.id)).toEqual(DEFAULT_MODELS.map((m) => m.id));

      // And a participant is offered the new first model straight away.
      const participant = await newParticipant(browser, "Mona Models");
      await participant.page.goto("/chat");
      await expect(
        participant.page.getByRole("button", { name: new RegExp(DEFAULT_MODELS[0].displayName) }),
      ).toBeVisible();
      await participant.context.close();
    } finally {
      await sql`update event_settings set enabled_models = ${sql.json(original)} where id = 1`;
      await organizer.context.close();
    }
  });
});
