import { expect, test } from "@playwright/test";
import { eventCode } from "./db";
import {
  PASSWORD,
  choose,
  finishOnboarding,
  signUp,
  uniqueEmail,
} from "./helpers";

test.describe("getting in", () => {
  test("a wrong event code is refused and says why", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("No Code");
    await page.getByLabel("Email").fill(uniqueEmail("nocode"));
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByLabel("Event code").fill("definitely-not-the-code");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("That event code is not valid")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test("the account endpoint itself refuses a sign-up without the code", async ({
    request,
    baseURL,
  }) => {
    // Skipping the form must not skip the check.
    const body = { name: "Direct", email: uniqueEmail("direct"), password: PASSWORD };
    const headers = { origin: baseURL! };

    const none = await request.post("/api/auth/sign-up/email", { data: body, headers });
    expect(none.status()).toBe(403);

    const inBody = await request.post("/api/auth/sign-up/email", {
      data: { ...body, eventCode: await eventCode() },
      headers,
    });
    expect(inBody.status()).toBe(403);
  });

  test("a weak password is refused, with the reason on screen", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Wendy Weak");
    await page.getByLabel("Email").fill(uniqueEmail("weak"));
    await page.getByLabel("Event code").fill(await eventCode());

    // The rules tick themselves off while typing.
    const rule = (text: string) => page.getByRole("listitem").filter({ hasText: text });
    await page.getByLabel("Password").fill("short1");
    await expect(rule("At least 8 characters")).toContainText("not yet met");
    await expect(rule("A letter and a number")).toContainText("(met)");

    // Long enough and mixed, but it is the event's own name.
    await page.getByLabel("Password").fill("astral2026");
    await expect(rule("At least 8 characters")).toContainText("(met)");
    await expect(rule("Not your name")).toContainText("not yet met");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("That password is too easy to guess.")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);

    // Her own name is no better.
    await page.getByLabel("Password").fill("wendy-lab-77");
    await expect(rule("Not your name")).toContainText("not yet met");

    // A decent one goes through.
    await page.getByLabel("Password").fill(PASSWORD);
    await expect(rule("Not your name")).toContainText("(met)");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/onboarding");
  });

  test("the server holds sign-ups to the same rules as the form", async ({
    request,
    baseURL,
  }) => {
    const headers = { origin: baseURL!, "x-event-code": await eventCode() };
    const attempt = (email: string, password: string) =>
      request.post("/api/auth/sign-up/email", {
        data: { name: "Direct Dan", email, password },
        headers,
      });

    const weak = await attempt(uniqueEmail("direct"), "password123");
    expect(weak.status()).toBe(400);
    expect((await weak.json()).message).toContain("too easy to guess");

    const noNumber = await attempt(uniqueEmail("direct"), "onlyletters");
    expect(noNumber.status()).toBe(400);

    const badEmail = await attempt("dan@nowhere", PASSWORD);
    expect(badEmail.status()).toBe(400);
    expect((await badEmail.json()).message).toContain("after the @");
  });

  test("a mistyped email is questioned, not refused", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("someone@gmial.com");
    await expect(page.getByText("Did you mean")).toBeVisible();
    await page.getByRole("button", { name: "someone@gmail.com" }).click();
    await expect(page.getByLabel("Email")).toHaveValue("someone@gmail.com");
    await expect(page.getByText("Did you mean")).toHaveCount(0);

    // A real address that merely looks unusual gets no comment.
    await page.getByLabel("Email").fill("someone@uni.ac.uk");
    await expect(page.getByText("Did you mean")).toHaveCount(0);
  });

  test("sign up, answer the profile questions, and land in the chat", async ({ page }) => {
    const email = uniqueEmail("newcomer");
    await signUp(page, "Nora Newcomer", email);
    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();

    await finishOnboarding(page, { affiliation: "Wyss Institute", role: "Faculty" });
    await expect(page.getByRole("heading", { name: "New conversation" })).toBeVisible();

    // What was answered is what the profile page shows.
    await page.getByRole("link", { name: /Nora Newcomer/ }).click();
    await expect(page.getByLabel("Affiliation")).toHaveValue("Wyss Institute");
    await expect(page.getByLabel("Role", { exact: true })).toContainText("Faculty");
    await expect(page.getByRole("main").getByText(email)).toBeVisible();
  });

  test("leaving a question unanswered names it and keeps the rest", async ({ page }) => {
    await signUp(page, "Hasty Harriet", uniqueEmail("hasty"));
    await page.getByLabel("Affiliation").fill("Somewhere");
    await choose(page, "Role", "Postdoc");
    await choose(page, "Highest degree", "PhD");
    // Years of experience deliberately left alone.
    await choose(page, "Primary background", "Both");
    await choose(page, "How familiar are you with AI chatbots?", "Casual user");
    await page.getByRole("checkbox", { name: /I have read and agree/ }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Please choose a range.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByLabel("Affiliation")).toHaveValue("Somewhere");
    await expect(page.getByLabel("Role", { exact: true })).toContainText("Postdoc");
    await expect(page.getByLabel("Primary background")).toContainText("Both");
  });

  test("a profile can be corrected afterwards", async ({ page }) => {
    await signUp(page, "Eddie Editor", uniqueEmail("editor"));
    await finishOnboarding(page);
    await page.goto("/profile");

    await page.getByLabel("Full name").fill("Edward Editor");
    await choose(page, "Highest degree", "MD");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Edward Editor");
    await expect(page.getByLabel("Highest degree")).toContainText("MD");
    // The name in the sidebar comes from the session, and follows.
    await expect(page.getByRole("link", { name: /Edward Editor/ })).toBeVisible();
  });
});
