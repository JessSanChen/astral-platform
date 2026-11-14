import { expect, test, type Browser, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { MAX_FAILED_SIGN_INS } from "@/lib/auth";
import { eventCode, sql, userId } from "./db";
import {
  PASSWORD,
  finishOnboarding,
  newOrganizer,
  newParticipant,
  signIn,
  uniqueEmail,
} from "./helpers";

/**
 * Gives an account a password the sign-up form would never accept, the way
 * an account made before the rules existed has one.
 */
async function setStoredPassword(email: string, password: string) {
  const hash = await hashPassword(password);
  await sql`
    update account set password = ${hash}
    where provider_id = 'credential' and user_id = ${await userId(email)}
  `;
}

async function signInWith(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A participant who chose their own password at sign-up. */
async function participantWithPassword(browser: Browser, name: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail("secure");
  await page.goto("/sign-up");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Event code").fill(await eventCode());
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding");
  await finishOnboarding(page);
  return { context, page, email, name };
}

const activity = (page: Page) => page.getByRole("listitem");

/**
 * Waits for a browser to find itself signed out.
 *
 * Ending a session on the server reaches a browser that is already signed
 * in within half a minute, not instantly: each browser carries a short-lived
 * copy of its session so that most pages need no trip to the database. The
 * organizer console does not rely on that copy and shuts at once.
 */
async function expectSignedOut(page: Page) {
  await expect(async () => {
    await page.goto("/chat");
    expect(page.url()).toMatch(/\/sign-in$/);
  }).toPass({ timeout: 45_000, intervals: [1_000, 3_000, 5_000] });
}

test.describe("keeping accounts from being walked into", () => {
  test("a password that would not be accepted today has to be replaced on signing in", async ({
    browser,
  }) => {
    const person = await newParticipant(browser, "Wade Weak");
    const page = person.page;
    // The password an early account might have: short of nothing the old
    // form asked for, and the first thing anyone would try.
    await setStoredPassword(person.email, "astral123");
    await person.context.clearCookies();

    await signInWith(page, person.email, "astral123");
    // Straight to choosing a new one, and nowhere else until it is done.
    await page.waitForURL("**/change-password");
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/change-password$/);
    const refused = await page.request.post("/api/conversations", {
      data: { modelId: "anything" },
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).message).toContain("password has to be replaced");

    // It asks for the current one, and holds the new one to the rules.
    await page.getByLabel("Current password").fill("not-the-password-1");
    await page.getByLabel("New password").fill("Lantern-Orchard-42");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That is not your current password.")).toBeVisible();

    await page.getByLabel("Current password").fill("astral123");
    await page.getByLabel("New password").fill("astral2026");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That password is too easy to guess.")).toBeVisible();

    await page.getByLabel("New password").fill("Lantern-Orchard-42");
    await page.getByRole("button", { name: "Change password" }).click();
    await page.waitForURL("**/chat");

    // The old one no longer opens the account; the new one does, and is
    // not questioned.
    await person.context.clearCookies();
    await signInWith(page, person.email, "astral123");
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await signInWith(page, person.email, "Lantern-Orchard-42");
    await page.waitForURL("**/chat");
    await person.context.close();
  });

  test("an organizer's password has to be longer than a participant's", async ({ browser }) => {
    const organizer = await newOrganizer(browser, "Olga Organizer");
    // Ten characters: fine for a participant.
    const person = await participantWithPassword(browser, "Petra Promoted", "Plum-Sky-7");

    try {
      await organizer.page.goto("/admin/participants");
      await organizer.page
        .locator("tr")
        .filter({ hasText: person.email })
        .getByRole("button", { name: "Manage" })
        .click();
      const controls = organizer.page.getByRole("group", { name: "Manage Petra Promoted" });
      await controls.getByRole("button", { name: "Make organizer" }).click();
      await expect(controls).toContainText("They are being signed out");

      // Signed out by the promotion.
      await expectSignedOut(person.page);

      // Signing back in as an organizer, the short password is not enough.
      await signInWith(person.page, person.email, "Plum-Sky-7");
      await person.page.waitForURL("**/change-password");
      await expect(person.page.getByRole("main")).toContainText(
        "organizer accounts need at least 12 characters",
      );
      // The console stays shut until it is replaced.
      await person.page.goto("/admin");
      await expect(person.page).toHaveURL(/\/change-password$/);

      await person.page.getByLabel("Current password").fill("Plum-Sky-7");
      await person.page.getByLabel("New password").fill("Pear-Sky-88");
      await person.page.getByRole("button", { name: "Change password" }).click();
      await expect(
        person.page.getByText("Organizer accounts need a password of at least 12 characters."),
      ).toBeVisible();
      await person.page.getByLabel("New password").fill("Pear-Sky-Lantern-88");
      await person.page.getByRole("button", { name: "Change password" }).click();
      await person.page.waitForURL("**/chat");
      await person.page.goto("/admin");
      await expect(person.page).toHaveURL(/\/admin$/);

      // All of it is on the record, with who did it.
      await organizer.page.goto("/admin/activity");
      await expect(
        activity(organizer.page).filter({ hasText: "made an organizer of" }).first(),
      ).toContainText(person.email);
      await expect(
        activity(organizer.page)
          .filter({ hasText: "Signed in with a password that has to be replaced" })
          .filter({ hasText: person.email }),
      ).toBeVisible();

      // Rights taken away are gone at once, not in half a minute.
      await organizer.page.goto("/admin/participants");
      await organizer.page
        .locator("tr")
        .filter({ hasText: person.email })
        .getByRole("button", { name: "Manage" })
        .click();
      await controls.getByRole("button", { name: "Remove organizer" }).click();
      await expect(controls).toContainText("Organizer rights removed, as of now.");
      await person.page.goto("/admin");
      await expect(person.page).toHaveURL(/\/chat$/);
    } finally {
      await organizer.context.close();
      await person.context.close();
    }
  });

  test("wrong passwords lock the account, and an organizer can let its owner back in", async ({
    browser,
    baseURL,
  }) => {
    const organizer = await newOrganizer(browser, "Oona Organizer");
    const victim = await newParticipant(browser, "Vera Victim");
    const guesser = await browser.newContext();
    const attempt = (password: string) =>
      guesser.request.post("/api/auth/sign-in/email", {
        data: { email: victim.email, password },
        headers: { origin: baseURL! },
      });

    try {
      // Someone works through guesses. Each is simply wrong, until the
      // account stops listening.
      for (let i = 1; i <= MAX_FAILED_SIGN_INS; i++) {
        expect((await attempt(`Guess-number-${i}`)).status()).toBe(401);
      }
      const locked = await attempt("Guess-number-99");
      expect(locked.status()).toBe(429);
      expect((await locked.json()).message).toContain("Too many wrong passwords");
      // Even the right password, so guessing on gains nothing.
      expect((await attempt(PASSWORD)).status()).toBe(429);

      // The organizers can see it happened.
      await organizer.page.goto("/admin/activity");
      await expect(
        activity(organizer.page)
          .filter({ hasText: "Sign-in was locked after repeated wrong passwords" })
          .filter({ hasText: victim.email }),
      ).toBeVisible();

      // The owner, meanwhile, is still signed in and can ask for help. An
      // organizer sets a password, which signs the account out everywhere
      // and lifts the lock.
      await organizer.page.goto("/admin/participants");
      await organizer.page
        .locator("tr")
        .filter({ hasText: victim.email })
        .getByRole("button", { name: "Manage" })
        .click();
      const controls = organizer.page.getByRole("group", { name: "Manage Vera Victim" });
      await controls.getByLabel("Temporary password").fill("Harbour-Gate-51");
      await controls.getByRole("button", { name: "Set password" }).click();
      await expect(controls).toContainText("Password set, and they are being signed out.");

      await expectSignedOut(victim.page);

      // The temporary password works once, to choose a real one.
      await signInWith(victim.page, victim.email, "Harbour-Gate-51");
      await victim.page.waitForURL("**/change-password");
      await victim.page.getByLabel("Current password").fill("Harbour-Gate-51");
      await victim.page.getByLabel("New password").fill("Quiet-Meadow-Path-7");
      await victim.page.getByRole("button", { name: "Change password" }).click();
      await victim.page.waitForURL("**/chat");

      await organizer.page.goto("/admin/activity");
      await expect(
        activity(organizer.page)
          .filter({ hasText: "set a temporary password for" })
          .filter({ hasText: victim.email }),
      ).toContainText("Oona Organizer");
    } finally {
      await guesser.close();
      await organizer.context.close();
      await victim.context.close();
    }
  });

  test("changing your password signs out anyone else using the account", async ({ browser }) => {
    const person = await newParticipant(browser, "Dora Double");
    // A second browser signed in to the same account: the owner's other
    // laptop, or somebody who should not be there.
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    await signIn(other, person.email);
    await expect(other).toHaveURL(/\/chat$/);

    await person.page.goto("/profile");
    await person.page.getByLabel("Current password").fill(PASSWORD);
    await person.page.getByLabel("New password").fill("Copper-Lantern-Hill-3");
    await person.page.getByRole("button", { name: "Change password" }).click();
    await expect(person.page.getByText("is being signed out")).toBeVisible();

    // The one who changed it carries on; the other is out.
    await person.page.goto("/chat");
    await expect(person.page).toHaveURL(/\/chat$/);
    await expectSignedOut(other);
    await person.page.goto("/chat");
    await expect(person.page).toHaveURL(/\/chat$/);

    await elsewhere.close();
    await person.context.close();
  });

  test("an organizer can sign every account out at once", async ({ browser }) => {
    const organizer = await newOrganizer(browser, "Oscar Organizer");
    const person = await newParticipant(browser, "Sam Session");

    await organizer.page.goto("/admin/activity");
    await organizer.page.getByRole("button", { name: "Sign everyone out" }).click();
    // It says what is about to happen, and can be backed out of.
    await expect(organizer.page.getByText("Sign out every account now, including yours?")).toBeVisible();
    await organizer.page.getByRole("button", { name: "Yes, sign everyone out" }).click();
    await organizer.page.waitForURL("**/sign-in");
    // The console is shut to that session at once, without waiting.
    const console_ = await organizer.page.request.get("/admin", { maxRedirects: 0 });
    expect(console_.headers()["location"]).toMatch(/\/sign-in$/);

    await expectSignedOut(person.page);

    // Signing back in is all it takes, and the record says who did it.
    await signIn(organizer.page, organizer.email);
    await organizer.page.goto("/admin/activity");
    await expect(
      activity(organizer.page).filter({ hasText: "signed everyone out" }).first(),
    ).toContainText("Oscar Organizer");

    await organizer.context.close();
    await person.context.close();
  });
});
