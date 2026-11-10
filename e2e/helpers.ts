import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { TEST_DOMAIN, eventCode, promoteToOrganizer } from "./db";

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

export type ProfileAnswers = {
  affiliation: string;
  role: string;
  degree: string;
  years: string;
  background: string;
  familiarity: string;
};

export const DEFAULT_PROFILE: ProfileAnswers = {
  affiliation: "Broad Institute",
  role: "Postdoc",
  degree: "PhD",
  years: "5-9",
  background: "Life sciences",
  familiarity: "Regular user",
};

export async function fillProfile(page: Page, answers: Partial<ProfileAnswers> = {}) {
  const a = { ...DEFAULT_PROFILE, ...answers };
  await page.getByLabel("Affiliation").fill(a.affiliation);
  await choose(page, "Role", a.role);
  await choose(page, "Highest degree", a.degree);
  await choose(page, "Years of experience", a.years);
  await choose(page, "Primary background", a.background);
  await choose(page, "How familiar are you with AI chatbots?", a.familiarity);
}

export async function finishOnboarding(page: Page, answers: Partial<ProfileAnswers> = {}) {
  await fillProfile(page, answers);
  await page.getByRole("checkbox", { name: /I have read and agree/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/chat");
}

/** A signed-up, onboarded participant in a browser of their own. */
export async function newParticipant(browser: Browser, name: string, tag = "participant") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(tag);
  await signUp(page, name, email);
  await finishOnboarding(page);
  return { context, page, email, name };
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

export async function startConversation(page: Page): Promise<string> {
  await page.goto("/chat");
  await page.getByRole("button", { name: "Start conversation" }).click();
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

export type Labels = {
  type: string;
  role: string;
  goal: string;
  behaviour: string;
  topic: string;
};

export const DEFAULT_LABELS: Labels = {
  type: "Benign",
  role: "Student",
  goal: "Understand the basics well enough to explain them.",
  behaviour: "Fully complied",
  topic: "Virology",
};

export function labelsPanel(page: Page) {
  return page.locator("aside").filter({ hasText: "Label this transcript" });
}

export async function fillLabels(page: Page, labels: Partial<Labels> = {}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const panel = labelsPanel(page);
  await choose(page, "What kind of transcript is this?", l.type, panel);
  await choose(page, "What role were you playing?", l.role, panel);
  await panel.getByLabel("What were you trying to get the model to do?").fill(l.goal);
  await choose(page, "How did the model respond?", l.behaviour, panel);
  await panel.getByRole("checkbox", { name: l.topic, exact: true }).check();
}

export function submitButton(page: Page) {
  return labelsPanel(page).getByRole("button", { name: /^Submit/ });
}

/** One exchange, labelled and submitted. Returns the conversation's id. */
export async function submittedTranscript(page: Page, question: string, labels: Partial<Labels> = {}) {
  const id = await startConversation(page);
  await say(page, question);
  await fillLabels(page, labels);
  await submitButton(page).click();
  await expect(labelsPanel(page)).toContainText("Submitted as version 1");
  return id;
}
