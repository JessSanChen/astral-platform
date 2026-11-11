import { expect, test } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers";

/**
 * The dropdown is our own, so what the browser's one did for free is ours to
 * keep working: the keyboard, what a screen reader is told, and posting with
 * the form.
 */
test.describe("the dropdown", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, "Kay Keyboard", uniqueEmail("select"));
  });

  test("works from the keyboard alone", async ({ page }) => {
    const role = page.getByLabel("Role", { exact: true });
    await role.focus();
    await expect(role).toHaveAttribute("aria-expanded", "false");
    await expect(role).toContainText("Select...");

    // Arrow down opens it on the first option; arrows move; Enter chooses.
    await page.keyboard.press("ArrowDown");
    await expect(role).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(role).toContainText("Postdoc");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(role).toBeFocused();

    // Typing jumps to an option by its first letters.
    await page.keyboard.type("ind");
    await expect(page.getByRole("option", { name: "Industry scientist" })).toHaveClass(/bg-muted/);
    await page.keyboard.press("Enter");
    await expect(role).toContainText("Industry scientist");

    // Escape backs out and changes nothing.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(role).toContainText("Industry scientist");

    // Tab moves on to the next field, taking the highlighted option along.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect(role).toContainText("Undergraduate student");
    await expect(page.getByLabel("Highest degree")).toBeFocused();
  });

  test("tells assistive technology what it is and what is chosen", async ({ page }) => {
    const degree = page.getByLabel("Highest degree");
    await expect(degree).toHaveRole("combobox");
    await degree.click();
    // Opened with the mouse, it still answers to the keyboard.
    await expect(degree).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await degree.click();

    const list = page.getByRole("listbox");
    await expect(list.getByRole("option")).toHaveCount(6);
    await list.getByRole("option", { name: "PhD" }).click();

    await degree.click();
    await expect(page.getByRole("option", { name: "PhD" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("option", { name: "MS" })).toHaveAttribute("aria-selected", "false");
  });

  test("closes on a click elsewhere, and posts its value with the form", async ({ page }) => {
    const years = page.getByLabel("Years of experience");
    await years.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("heading", { name: "About you" }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(years).toContainText("Select...");

    await years.click();
    await page.getByRole("option", { name: "10+" }).click();
    await expect(page.locator('input[type=hidden][name="yearsExperience"]')).toHaveValue("10+");
  });

  test("opens upwards rather than off the bottom of the screen", async ({ page }) => {
    // A short window, with the field scrolled to its foot.
    await page.setViewportSize({ width: 1100, height: 520 });
    const familiarity = page.getByLabel("How familiar are you with AI chatbots?");
    await familiarity.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await familiarity.click();

    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    const box = (await list.boundingBox())!;
    const field = (await familiarity.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(520);
    // And it is above the field, not over it.
    expect(box.y + box.height).toBeLessThanOrEqual(field.y + 1);
  });
});
