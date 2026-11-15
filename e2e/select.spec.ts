import { expect, test } from "@playwright/test";
import { INTAKE, signUp, uniqueEmail } from "./helpers";

/**
 * The dropdown is our own, so what the browser's one did for free is ours to
 * keep working: the keyboard, what a screen reader is told, and carrying its
 * value into the form.
 */
test.describe("the dropdown", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, "Kay Keyboard", uniqueEmail("select"));
  });

  test("works from the keyboard alone", async ({ page }) => {
    const field = page.getByLabel(INTAKE.biosafety, { exact: true });
    await field.focus();
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(field).toContainText("Select...");

    // Arrow down opens it on the first option; arrows move; Enter chooses.
    await page.keyboard.press("ArrowDown");
    await expect(field).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(field).toContainText("Practical assessment or review experience");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(field).toBeFocused();

    // Typing jumps to an option by its first letters.
    await page.keyboard.type("for");
    await expect(page.getByRole("option", { name: "Formal training/coursework only" })).toHaveClass(
      /bg-muted/,
    );
    await page.keyboard.press("Enter");
    await expect(field).toContainText("Formal training/coursework only");

    // Escape backs out and changes nothing.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(field).toContainText("Formal training/coursework only");

    // Tab moves on to the next field, taking the highlighted option along.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect(field).toContainText(INTAKE.noTraining);
    await expect(page.getByLabel(INTAKE.biosecurity, { exact: true })).toBeFocused();
  });

  test("tells assistive technology what it is and what is chosen", async ({ page }) => {
    const field = page.getByLabel(INTAKE.biosecurity, { exact: true });
    await expect(field).toHaveRole("combobox");
    await field.click();
    // Opened with the mouse, it still answers to the keyboard.
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await field.click();

    const list = page.getByRole("listbox");
    await expect(list.getByRole("option")).toHaveCount(5);
    await list.getByRole("option", { name: "Prefer not to say" }).click();

    await field.click();
    await expect(page.getByRole("option", { name: "Prefer not to say" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("option", { name: INTAKE.noTraining })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("closes on a click elsewhere, and its value goes in with the form", async ({ page }) => {
    const field = page.getByLabel(INTAKE.biosafety, { exact: true });
    await field.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("heading", { name: "About your background" }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(field).toContainText("Select...");

    await field.click();
    await page.getByRole("option", { name: INTAKE.noTraining }).click();
    const posted = await page.locator('input[type=hidden][name="intake"]').inputValue();
    expect(JSON.parse(posted)).toMatchObject({ biosafety: "none" });
  });

  test("opens upwards rather than off the bottom of the screen", async ({ page }) => {
    // A short window, with the field scrolled to its foot.
    await page.setViewportSize({ width: 1100, height: 520 });
    const field = page.getByLabel("How often do you currently use AI assistants? (optional)");
    await field.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await field.click();

    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    const box = (await list.boundingBox())!;
    const at = (await field.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(520);
    // And it is above the field, not over it.
    expect(box.y + box.height).toBeLessThanOrEqual(at.y + 1);
  });
});
