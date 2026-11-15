import { expect, test } from "@playwright/test";
import { eventCode, sql } from "./db";
import {
  INTAKE,
  PASSWORD,
  agreeToStudy,
  choose,
  fillIntake,
  finishOnboarding,
  skipWorkRows,
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

  const stored = async (email: string) => {
    const [row] = await sql`
      select p.intake, p.intake_version, p.participation_agreed_at, p.research_use_agreed_at,
             p.public_release_permission
      from profile p join "user" u on u.id = p.user_id where u.email = ${email}
    `;
    return row;
  };

  test("sign up, agree, answer the background questions, and land in the chat", async ({ page }) => {
    const email = uniqueEmail("newcomer");
    await signUp(page, "Nora Newcomer", email);
    await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();

    await finishOnboarding(page, { area: INTAKE.virology, level: INTAKE.specialist });
    await expect(page.getByRole("heading", { name: "New conversation" })).toBeVisible();

    const row = await stored(email);
    expect(row.intake).toMatchObject({
      backgroundResponse: "selected_areas",
      backgroundDomains: ["bio_microbiology"],
      familiarityResponse: "rated_areas",
      familiarity: { bio_microbiology: "F3" },
      biosafety: "none",
      biosecurity: "none",
    });
    expect(row.intake_version).toBe("A-1.1");
    expect(row.participation_agreed_at).not.toBeNull();
    expect(row.research_use_agreed_at).not.toBeNull();
    // Left unanswered is stored as unanswered, not as No.
    expect(row.public_release_permission).toBeNull();
  });

  test("both agreements are needed; public release is a separate, optional answer", async ({
    page,
  }) => {
    const email = uniqueEmail("agree");
    await signUp(page, "Agnes Agrees", email);
    await fillIntake(page);
    await page.getByRole("checkbox", { name: /I have read the study information/ }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/This agreement is needed to contribute to the research/)).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    // What was already answered is still there.
    await expect(page.getByRole("checkbox", { name: /I have read the study information/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: INTAKE.noBackground })).toBeChecked();

    await page.getByRole("checkbox", { name: /may be used for the\s+stated research/ }).check();
    await page.getByRole("group", { name: "Public release" }).getByRole("radio", { name: "No" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/chat");
    expect((await stored(email)).public_release_permission).toBe("no");
  });

  test("leaving a required answer out names it and keeps the rest", async ({ page }) => {
    await signUp(page, "Hasty Harriet", uniqueEmail("hasty"));
    await agreeToStudy(page);
    await page.getByRole("radio", { name: INTAKE.noBackground }).check();
    await skipWorkRows(page);
    await choose(page, INTAKE.biosafety, "Formal training/coursework only");
    // What you could review, and biosecurity, deliberately left alone.
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Please complete the highlighted answers.")).toBeVisible();
    await expect(page.getByText("Choose one of the three answers.")).toBeVisible();
    await expect(page.getByText("Choose an answer, or prefer not to say.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    // A screen reader is told which field it is.
    const biosecurity = page.getByLabel(INTAKE.biosecurity, { exact: true });
    await expect(biosecurity).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(INTAKE.biosafety, { exact: true })).not.toHaveAttribute("aria-invalid");
    await expect(page.getByLabel(INTAKE.biosafety, { exact: true })).toContainText(
      "Formal training/coursework only",
    );
    await expect(page.getByRole("radio", { name: INTAKE.noBackground })).toBeChecked();
  });

  test('ticking "Other" asks which area, and it cannot be rated for review', async ({ page }) => {
    const email = uniqueEmail("other");
    await signUp(page, "Olive Other", email);
    await agreeToStudy(page);
    await page.getByRole("radio", { name: INTAKE.hasAreas }).check();
    const which = page.getByLabel("Which other area?");
    await expect(which).toHaveCount(0);
    await page.getByRole("checkbox", { name: /^Other/ }).check();
    await expect(which).toBeVisible();
    await page.getByRole("radio", { name: INTAKE.nothingToRate }).check();
    await skipWorkRows(page);
    await choose(page, INTAKE.biosafety, INTAKE.noTraining);
    await choose(page, INTAKE.biosecurity, INTAKE.noTraining);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please say which other area.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);

    await which.fill("Aerobiology");
    // An area of one's own naming is recorded, but opens no review to anyone.
    await page.getByRole("radio", { name: INTAKE.willRate }).check();
    await expect(page.getByText(/Tick the areas you have studied or worked in/)).toBeVisible();
    await page.getByRole("radio", { name: INTAKE.nothingToRate }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/chat");
    expect((await stored(email)).intake).toMatchObject({
      backgroundDomains: ["other"],
      otherDomainText: "Aerobiology",
      familiarity: {},
    });
  });

  test("background answers can be corrected afterwards", async ({ page }) => {
    const email = uniqueEmail("editor");
    await signUp(page, "Eddie Editor", email);
    await finishOnboarding(page);
    await page.goto("/profile");

    await page.getByLabel("Full name").fill("Edward Editor");
    await choose(page, INTAKE.biosafety, "Practical assessment or review experience");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Edward Editor");
    await expect(page.getByLabel(INTAKE.biosafety, { exact: true })).toContainText(
      "Practical assessment or review experience",
    );
    expect((await stored(email)).intake).toMatchObject({ biosafety: "practical_review" });
    // The name in the sidebar comes from the session, and follows.
    await expect(page.getByRole("link", { name: /Edward Editor/ })).toBeVisible();
  });
});
