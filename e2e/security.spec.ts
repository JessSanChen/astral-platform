import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { MAX_FAILED_SIGN_INS } from "@/lib/sign-in-guard";
import { eventCode, sql, userId } from "./db";
import {
  PASSWORD,
  finishOnboarding,
  newOrganizer,
  newParticipant,
  say,
  signIn,
  startConversation,
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
  test("a password anyone could guess is refused outright, even when it is right", async ({
    browser,
    baseURL,
  }) => {
    const person = await newParticipant(browser, "Gus Guessable");
    const page = person.page;
    // The password an early account might have: nothing the old form
    // objected to, and the first thing anyone would try.
    await setStoredPassword(person.email, "astral123");
    await person.context.clearCookies();

    // It is the right password, and it does not open the account. Letting
    // it work "once, to choose a new one" would let whoever tried it first
    // do the choosing.
    await signInWith(page, person.email, "astral123");
    await expect(page.getByText("too easy to guess, so it is no longer accepted here")).toBeVisible();
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/sign-in$/);
    const direct = await page.request.post("/api/auth/sign-in/email", {
      data: { email: person.email, password: "astral123" },
      headers: { origin: baseURL! },
    });
    expect(direct.status()).toBe(403);
    // Nothing was counted against the account: it was never a guess at it.
    const [{ failed_sign_ins: counted }] =
      await sql`select failed_sign_ins from "user" where email = ${person.email}`;
    expect(counted).toBe(0);

    // The way back needs someone the guesser cannot be: an organizer, or
    // whoever holds the database credentials.
    const output = execFileSync("npx", ["tsx", "scripts/set-password.ts", person.email], {
      encoding: "utf8",
      env: process.env,
    });
    const temporary = output.match(/Temporary password:\s+(\S+)/)?.[1];
    expect(temporary).toBeTruthy();

    await signInWith(page, person.email, temporary!);
    await page.waitForURL("**/change-password");
    await page.getByLabel("Current password").fill(temporary!);
    await page.getByLabel("New password").fill("Lantern-Orchard-42");
    await page.getByRole("button", { name: "Change password" }).click();
    await page.waitForURL("**/chat");
    await person.context.close();
  });

  test("a password built on the owner's own name has to be replaced before anything else", async ({
    browser,
    baseURL,
  }) => {
    const person = await newParticipant(browser, "Wade Weakly");
    const page = person.page;
    const conversation = await startConversation(page);
    await say(page, "Said before the password was questioned.");
    // Not one a stranger would try, but not one the form accepts either.
    await setStoredPassword(person.email, "wade-weakly-2026");
    await person.context.clearCookies();

    await signInWith(page, person.email, "wade-weakly-2026");
    // Straight to choosing a new one, and nowhere else until it is done.
    await page.waitForURL("**/change-password");
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/change-password$/);

    // Not by going round the pages, either: nothing can be written or read.
    const write = await page.request.post("/api/conversations", { data: { modelId: "anything" } });
    expect(write.status()).toBe(403);
    expect((await write.json()).message).toContain("password has to be replaced");
    expect(
      (await page.request.get(`/api/conversations/${conversation}/messages`)).status(),
    ).toBe(403);
    // The scanners answer organizers only; to anyone else they are not there.
    for (const path of ["/api/judge", "/api/judge/configs"]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    // And the login system's own way of changing a password, which knows
    // none of the rules, is not on offer.
    const bypass = await page.request.post("/api/auth/change-password", {
      data: { currentPassword: "wade-weakly-2026", newPassword: "password1" },
      headers: { origin: baseURL! },
    });
    expect(bypass.status()).toBe(404);

    // The form asks for the current one, and holds the new one to the rules.
    await page.getByLabel("Current password").fill("not-the-password-1");
    await page.getByLabel("New password").fill("Lantern-Orchard-42");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That is not your current password.")).toBeVisible();

    await page.getByLabel("Current password").fill("wade-weakly-2026");
    await page.getByLabel("New password").fill("astral2026");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That password is too easy to guess.")).toBeVisible();

    await page.getByLabel("New password").fill("Lantern-Orchard-42");
    await page.getByRole("button", { name: "Change password" }).click();
    await page.waitForURL("**/chat");

    // The old one no longer opens the account; the new one does, and is
    // not questioned.
    await person.context.clearCookies();
    await signInWith(page, person.email, "wade-weakly-2026");
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await signInWith(page, person.email, "Lantern-Orchard-42");
    await page.waitForURL("**/chat");
    await person.context.close();
  });

  test("an organizer's password has to be longer than a participant's", async ({
    browser,
    baseURL,
  }) => {
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

      // The login system has an administration API of its own. An
      // organizer's browser gets nothing from it: everything goes through
      // the console, which checks, limits and records.
      const target = await userId(person.email);
      for (const [path, data] of [
        ["/api/auth/admin/set-user-password", { userId: target, newPassword: "anything-at-all-1" }],
        ["/api/auth/admin/set-role", { userId: target, role: "admin" }],
        ["/api/auth/admin/impersonate-user", { userId: target }],
        ["/api/auth/admin/remove-user", { userId: target }],
      ] as const) {
        const res = await organizer.page.request.post(path, { data, headers: { origin: baseURL! } });
        expect(res.status(), path).toBe(404);
      }
      expect((await organizer.page.request.get("/api/auth/admin/list-users")).status()).toBe(404);

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
          .filter({ hasText: "Password attempts ran out, and sign-in was locked" })
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

  test("guesses sent all at once do not get past the limit", async ({ browser, baseURL }) => {
    const victim = await newParticipant(browser, "Polly Parallel");
    const guesser = await browser.newContext();
    // Forty at the same moment, none of them right.
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        guesser.request
          .post("/api/auth/sign-in/email", {
            data: { email: victim.email, password: `Parallel-guess-${i}` },
            headers: { origin: baseURL! },
          })
          .then((res) => res.status()),
      ),
    );
    // However close together they arrive, only so many are ever checked.
    const checked = results.filter((status) => status === 401).length;
    const refused = results.filter((status) => status === 429).length;
    expect(checked).toBeLessThanOrEqual(MAX_FAILED_SIGN_INS);
    expect(checked + refused).toBe(40);
    await guesser.close();
    await victim.context.close();
  });

  test("a paused account using the right password is not counted as guessing", async ({
    browser,
    baseURL,
  }) => {
    const person = await newParticipant(browser, "Pia Paused");
    await sql`update "user" set banned = true where email = ${person.email}`;
    const elsewhere = await browser.newContext();
    for (let i = 0; i < MAX_FAILED_SIGN_INS + 3; i++) {
      const res = await elsewhere.request.post("/api/auth/sign-in/email", {
        data: { email: person.email, password: PASSWORD },
        headers: { origin: baseURL! },
      });
      // Refused for being paused, every time, and never for "too many
      // wrong passwords": there were none.
      expect(res.status()).toBe(403);
    }
    const [row] = await sql`
      select failed_sign_ins, locked_until from "user" where email = ${person.email}
    `;
    expect(row).toMatchObject({ failed_sign_ins: 0, locked_until: null });
    await elsewhere.close();
    await person.context.close();
  });

  test("the current password cannot be guessed at on the change form", async ({ browser }) => {
    const person = await newParticipant(browser, "Lena Laptop");
    const page = person.page;
    await page.goto("/profile");
    const attempts = async () => {
      const [row] = await sql`select failed_sign_ins from "user" where email = ${person.email}`;
      return row.failed_sign_ins as number;
    };

    // Somebody at an unattended laptop, trying to make the account theirs.
    await page.getByLabel("New password").fill("Copper-Lantern-Hill-3");
    for (let i = 1; i <= MAX_FAILED_SIGN_INS; i++) {
      await page.getByLabel("Current password").fill(`Wrong-guess-number-${i}`);
      await page.getByRole("button", { name: "Change password" }).click();
      await expect.poll(attempts).toBe(i);
    }
    await expect(page.getByText("That is not your current password.")).toBeVisible();

    // One more, and the form stops listening, even to the right one.
    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Too many wrong passwords for this account.")).toBeVisible();
    // The password was not changed.
    const [{ must_change_password: flagged }] =
      await sql`select must_change_password from "user" where email = ${person.email}`;
    expect(flagged).toBe(false);
    await person.context.close();
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
