import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { TEST_DOMAIN, episodeOf, eventCode, passInstructionCheck, promoteToOrganizer } from "./db";

export const PASSWORD = "Correct-Horse-9";

let counter = 0;
/** A fresh address per account, at the domain the cleanup looks for. */
export function uniqueEmail(tag: string) {
  counter += 1;
  return `${tag}-${Date.now().toString(36)}-${counter}@${TEST_DOMAIN}`;
}

/**
 * Picks an option from one of the app's dropdowns, the way a person does:
 * open the field by its label, click the option by its name.
 */
export async function choose(
  page: Page,
  label: string | RegExp,
  option: string | RegExp,
  scope: Page | Locator = page,
) {
  const field = scope.getByLabel(label, { exact: true });
  await field.click();
  // The list is drawn at the top of the page, not inside the field.
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(field).toContainText(option);
}

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Event code").fill(await eventCode());
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding");
}

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(chat|onboarding)/);
}

/** The words of the intake form, as shown. */
export const INTAKE = {
  role: "Which best describes your current main role?",
  noBackground: "No specialized background in these areas",
  routine:
    "I can assess routine work, recognize important assumptions, and identify material errors or missing evidence in this area.",
  specialist:
    "I can assess specialized or ambiguous work and explain its important limitations in this area.",
  virology: "Microbiology and virology",
  wetLab: "Wet-lab research",
  aiUse: "How often do you currently use AI assistants? (optional)",
} as const;

/** Someone who says they can assess one subject, and how well. */
export type Expertise = { area: string; level: string };

export async function agreeToStudy(page: Page) {
  await page.getByRole("checkbox", { name: /I have read the study information/ }).check();
  await page.getByRole("checkbox", { name: /may be used for the\s+stated research/ }).check();
}

/** The five rows about kinds of work, answered in one go. */
export async function skipWorkRows(page: Page) {
  await page.getByRole("checkbox", { name: "Prefer not to say, for this whole question" }).check();
}

/** The intake questions that have to be answered, answered. */
export async function fillIntake(page: Page, expertise?: Expertise) {
  await choose(page, INTAKE.role, "Postdoctoral researcher");
  if (expertise) {
    await page.getByRole("checkbox", { name: expertise.area, exact: true }).check();
    await choose(page, `${expertise.area}: what you could assess`, expertise.level);
  } else {
    await page.getByRole("checkbox", { name: INTAKE.noBackground }).check();
  }
  await skipWorkRows(page);
}

export async function finishOnboarding(page: Page, expertise?: Expertise) {
  await agreeToStudy(page);
  await fillIntake(page, expertise);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/chat");
}

/** A signed-up, onboarded participant in a browser of their own. */
export async function newParticipant(
  browser: Browser,
  name: string,
  tag = "participant",
  expertise?: Expertise,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(tag);
  await signUp(page, name, email);
  await finishOnboarding(page, expertise);
  return { context, page, email, name };
}

/** A participant who has already passed the review instruction check. */
export async function newReviewer(browser: Browser, name: string, expertise?: Expertise) {
  const person = await newParticipant(browser, name, "reviewer", expertise);
  await passInstructionCheck(person.email);
  return person;
}

/**
 * An organizer. The role is not something anyone can give themselves, so
 * this is the one place the suite reaches into the database: promote, then
 * sign in again so the session carries the role.
 */
export async function newOrganizer(browser: Browser, name = "Olive Organizer") {
  const person = await newParticipant(browser, name, "organizer");
  await promoteToOrganizer(person.email);
  await person.context.clearCookies();
  await signIn(person.page, person.email);
  return person;
}

export const PROVENANCE = {
  real: "Based on a real task",
  invented: "Created for this exercise",
} as const;

/** Starts a conversation, or a folder. Returns the first session's id. */
export async function startConversation(
  page: Page,
  options: { folder?: boolean; provenance?: keyof typeof PROVENANCE; goal?: string } = {},
): Promise<string> {
  await page.goto(options.folder ? "/chat?folder=1" : "/chat");
  await page.getByRole("radio", { name: new RegExp(PROVENANCE[options.provenance ?? "invented"]) }).check();
  if (options.goal) {
    await page.getByText("Add a goal or notes (optional)").click();
    await page.getByLabel("What are you exploring or trying to accomplish?").fill(options.goal);
  }
  await page
    .getByRole("button", { name: options.folder ? "Start folder" : "Start conversation" })
    .click();
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

/** Sends a message and waits for the stand-in model's reply to it. */
export async function say(page: Page, text: string) {
  const composer = page.getByPlaceholder("Send a message...");
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(`to: ${text}`)).toBeVisible();
  // The composer comes back once the reply has finished.
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/** Submits whatever is on screen, confirming when asked. */
export async function submitWork(page: Page) {
  await page.getByRole("button", { name: /^Submit (conversation|folder)$/ }).click();
  await page.getByRole("button", { name: "Yes, submit" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Submitted" })).toBeVisible();
}

/** One exchange, submitted. Returns the session and the episode. */
export async function submittedConversation(page: Page, question: string) {
  const sessionId = await startConversation(page);
  await say(page, question);
  await submitWork(page);
  return { sessionId, episodeId: await episodeOf(sessionId) };
}

/* ---- Reviewing -------------------------------------------------------- */

export function reviewForm(page: Page) {
  return page.getByRole("complementary", { name: "Review form" });
}

/** Asks for the next item and waits for it to open. */
export async function getReview(page: Page) {
  await page.goto("/review");
  await page.getByRole("button", { name: /^(Get a review|Next item)$/ }).click();
  await page.waitForURL(/\/review\/[0-9a-f-]{36}$/);
  await expect(reviewForm(page)).toBeVisible();
  return page.url().split("/").pop()!;
}

export type ReviewChoices = {
  verdict: "Yes" | "No" | "Cannot determine under this policy and record";
  basis: RegExp | string;
  confidence: "Low" | "Moderate" | "High";
  /** Turn numbers to click; none means the absence-based answer. */
  turns: number[];
  rationale: string;
};

export const A_NO: ReviewChoices = {
  verdict: "No",
  basis: "No qualifying criterion",
  confidence: "High",
  turns: [],
  rationale: "Ordinary question with nothing the policy lists. Limited to what is shown.",
};

/** Fills in every required answer of form C. */
export async function fillReview(page: Page, choices: ReviewChoices = A_NO) {
  const form = reviewForm(page);
  const question = (id: string) => form.locator(`[data-question="${id}"]`);
  await question("verdict").getByRole("radio", { name: choices.verdict, exact: true }).check();
  await question("policyBasis").getByRole("radio", { name: choices.basis }).check();
  await question("confidence").getByRole("radio", { name: choices.confidence, exact: true }).check();
  if (choices.turns.length) {
    for (const n of choices.turns) {
      await page.getByRole("button", { name: `Turn ${n}`, exact: true }).click();
    }
  } else {
    await question("evidenceMode").getByRole("radio", { name: /absence-based/ }).check();
  }
  await question("rationale").getByRole("textbox").fill(choices.rationale);
  await question("subjectSensitivity").getByRole("radio", { name: /^g0/ }).check();
  await question("aimEvidence").getByRole("radio", { name: /^a0/ }).check();
}

export async function submitReview(page: Page) {
  await reviewForm(page).getByRole("button", { name: "Submit review" }).click();
  await expect(reviewForm(page).getByText("Review recorded")).toBeVisible();
}
