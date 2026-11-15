import { expect, test } from "@playwright/test";
import { eventCode, sql } from "./db";
import {
  INTAKE,
  PASSWORD,
  TERMS_BOX,
  agreeToStudy,
  choose,
  fillIntake,
  fillWorkRows,
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

    // The role comes first, then the subject areas with the rating beside them.
    // Counted within the background questions: the terms above them have
    // headings of their own, whatever text an organizer has published.
    const sections = await page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "About your background" }) })
      .getByRole("heading", { level: 3 })
      .allInnerTexts();
    expect(sections).toEqual([
      "Current role",
      "Subject background",
      "Work you have personally done",
      "AI assistants",
    ]);
    await expect(page.getByText("Other technical fields")).toBeVisible();
    // One way of declining is left, in the list of subject areas. Nothing
    // in the background questions is marked optional.
    const background = page.locator("section").filter({
      has: page.getByRole("heading", { name: "About your background" }),
    });
    await expect(background.getByText("Prefer not to say")).toHaveCount(1);
    await expect(background.getByText(/\(optional\)/)).toHaveCount(0);
    await expect(background.getByText(/primary area|specialization/i)).toHaveCount(0);

    await finishOnboarding(page, { area: INTAKE.virology, level: INTAKE.specialist });
    await expect(page.getByRole("heading", { name: "New", exact: true })).toBeVisible();

    const row = await stored(email);
    expect(row.intake).toMatchObject({
      role: "postdoctoral",
      backgroundResponse: "selected_areas",
      backgroundDomains: ["bio_microbiology"],
      familiarityResponse: "rated_areas",
      familiarity: { bio_microbiology: "F3" },
      focusTags: [],
      work: { wet_lab: "none", clinical: "none" },
      aiUse: "weekly",
    });
    // Questions that are no longer asked, and the form's own bookkeeping,
    // leave nothing behind.
    for (const gone of ["biosafety", "primaryDomain", "specializationText", "backgroundFlags", "focusNone"]) {
      expect(row.intake).not.toHaveProperty(gone);
    }
    expect(row.intake_version).toBe("A-1.3");
    expect(row.participation_agreed_at).not.toBeNull();
    expect(row.research_use_agreed_at).not.toBeNull();
    // Left unanswered is stored as unanswered, not as No.
    expect(row.public_release_permission).toBeNull();
  });

  test("agreeing to the terms is needed; public release is a separate, optional answer", async ({
    page,
  }) => {
    const email = uniqueEmail("agree");
    await signUp(page, "Agnes Agrees", email);
    // One agreement, worded as the terms word it. No second box.
    // Exactly this: the published terms may have a title of their own
    // that contains these words.
    await expect(
      page.getByRole("heading", { name: "Participant Terms and Conditions", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /stated research/ })).toHaveCount(0);
    await expect(page.getByRole("main").getByText(/study information/i)).toHaveCount(0);
    await fillIntake(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("You need to agree to the terms in order to continue.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    // What was already answered is still there.
    await expect(page.getByRole("checkbox", { name: INTAKE.noBackground })).toBeChecked();

    await page.getByRole("checkbox", { name: TERMS_BOX }).check();
    await page.getByRole("group", { name: "Public release" }).getByRole("radio", { name: "No" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/chat");
    const row = await stored(email);
    expect(row.public_release_permission).toBe("no");
    expect(row.intake).toMatchObject({
      backgroundResponse: "none",
      backgroundDomains: [],
      familiarityResponse: "none_to_rate",
    });
  });

  test("leaving a required answer out names it and keeps the rest", async ({ page }) => {
    await signUp(page, "Hasty Harriet", uniqueEmail("hasty"));
    await agreeToStudy(page);
    await page.getByRole("checkbox", { name: INTAKE.noBackground }).check();
    await choose(page, INTAKE.wetLab, "Coursework or training only");
    // The role, four of the five kinds of work, the two tick boxes about
    // AI safety and biosecurity, and AI use, deliberately left alone.
    await page.getByRole("button", { name: "Continue" }).click();

    // Every one of them is named, at once.
    await expect(page.getByText("Please complete the highlighted answers.")).toBeVisible();
    await expect(page.getByText("Choose your current role.")).toBeVisible();
    await expect(page.getByText("Choose an answer for each row (4 left).")).toBeVisible();
    await expect(page.getByText("Tick one or both, or Neither.")).toBeVisible();
    await expect(page.getByText("Say how often you use AI assistants.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    // A screen reader is told which field it is.
    const role = page.getByLabel(INTAKE.role, { exact: true });
    await expect(role).toHaveAttribute("aria-invalid", "true");
    await expect(role).toHaveAttribute("aria-required", "true");
    await expect(role).toHaveAccessibleDescription("Choose your current role.");
    await expect(page.getByLabel(INTAKE.wetLab, { exact: true })).toContainText(
      "Coursework or training only",
    );
    await expect(page.getByRole("checkbox", { name: INTAKE.noBackground })).toBeChecked();
  });

  test('"No specialized background" cannot be ticked together with an area', async ({ page }) => {
    const email = uniqueEmail("conflict");
    await signUp(page, "Connie Conflict", email);
    await agreeToStudy(page);
    await choose(page, INTAKE.role, "Doctoral student");
    await page.getByRole("checkbox", { name: "AI safety and alignment" }).check();
    // "Neither" and a tick beside it cannot both stand: the later one wins.
    await page.getByRole("checkbox", { name: "Neither", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "AI safety and alignment" })).not.toBeChecked();
    await page.getByRole("checkbox", { name: "Biosecurity", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "Neither", exact: true })).not.toBeChecked();
    await fillWorkRows(page);
    await choose(page, INTAKE.aiUse, "Daily or almost daily");

    // Nothing ticked at all is refused, by name.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Tick the areas that apply, or one of the last two answers.")).toBeVisible();

    // Both at once is said at the moment it happens, and refused if sent.
    await page.getByRole("checkbox", { name: "Immunology", exact: true }).check();
    await page.getByRole("checkbox", { name: INTAKE.noBackground }).check();
    const complaint = page.getByRole("alert").filter({ hasText: /each stand alone/ });
    await expect(complaint).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(complaint).toBeVisible();

    await page.getByRole("checkbox", { name: INTAKE.noBackground }).uncheck();
    await expect(complaint).toHaveCount(0);
    // An area ticked and left unrated is fine: it opens general reviews only.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/chat");
    expect((await stored(email)).intake).toMatchObject({
      backgroundResponse: "selected_areas",
      backgroundDomains: ["bio_immunology"],
      familiarityResponse: "none_to_rate",
      familiarity: {},
      focusTags: ["biosecurity"],
      aiUse: "daily_or_almost_daily",
    });
  });

  test('ticking "Other" asks which area, and it cannot be rated for review', async ({ page }) => {
    const email = uniqueEmail("other");
    await signUp(page, "Olive Other", email);
    await agreeToStudy(page);
    await choose(page, INTAKE.role, "Independent researcher");
    const which = page.getByLabel("Which other area?");
    await expect(which).toHaveCount(0);
    await page.getByRole("checkbox", { name: /^Other/ }).check();
    await expect(which).toBeVisible();
    await page.getByRole("checkbox", { name: "Neither", exact: true }).check();
    await fillWorkRows(page);
    await choose(page, INTAKE.aiUse, "Never");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please say which other area.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);

    await which.fill("Aerobiology");
    // An area of one's own naming is recorded, but there is nothing to rate
    // for it, so it opens no review to anyone.
    await expect(page.getByText(/what could you assess\?/)).toHaveCount(0);
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
    await choose(page, INTAKE.role, "Policy or safety professional");
    await page.getByRole("checkbox", { name: "Biosecurity", exact: true }).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Edward Editor");
    await expect(page.getByLabel(INTAKE.role, { exact: true })).toContainText(
      "Policy or safety professional",
    );
    await expect(page.getByRole("checkbox", { name: INTAKE.noBackground })).toBeChecked();
    expect((await stored(email)).intake).toMatchObject({
      role: "policy_safety",
      focusTags: ["biosecurity"],
      backgroundResponse: "none",
    });
    // The name in the sidebar comes from the session, and follows.
    await expect(page.getByRole("link", { name: /Edward Editor/ })).toBeVisible();
  });
});
