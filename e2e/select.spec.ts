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
    const field = page.getByLabel(INTAKE.role, { exact: true });
    // The pointer is wherever the last click left it, which is where this
    // list opens. Out of the way: this test is about the keyboard.
    await page.mouse.move(0, 0);
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
    await expect(field).toContainText("Doctoral student");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(field).toBeFocused();

    // Typing jumps to an option by its first letters.
    await page.keyboard.type("ind");
    await expect(page.getByRole("option", { name: "Industry scientist or engineer" })).toHaveClass(
      /bg-muted/,
    );
    await page.keyboard.press("Enter");
    await expect(field).toContainText("Industry scientist or engineer");

    // Escape backs out and changes nothing.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(field).toContainText("Industry scientist or engineer");

    // Tab moves on to the next field, taking the highlighted option along.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect(field).toContainText("Undergraduate student");
    await expect(
      page.getByRole("checkbox", { name: "Biochemistry, molecular and cell biology" }),
    ).toBeFocused();
  });

  test("tells assistive technology what it is and what is chosen", async ({ page }) => {
    const field = page.getByLabel(INTAKE.wetLab, { exact: true });
    await expect(field).toHaveRole("combobox");
    await field.click();
    // Opened with the mouse, it still answers to the keyboard.
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await field.click();

    const list = page.getByRole("listbox");
    await expect(list.getByRole("option")).toHaveCount(8);
    await list.getByRole("option", { name: "Coursework or training only" }).click();

    await field.click();
    await expect(page.getByRole("option", { name: "Coursework or training only" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("option", { name: "None", exact: true })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("closes on a click elsewhere, and its value goes in with the form", async ({ page }) => {
    const field = page.getByLabel(INTAKE.role, { exact: true });
    await field.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("heading", { name: "About your background" }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(field).toContainText("Select...");

    await field.click();
    await page.getByRole("option", { name: "Postdoctoral researcher" }).click();
    const posted = await page.locator('input[type=hidden][name="intake"]').inputValue();
    expect(JSON.parse(posted)).toMatchObject({ role: "postdoctoral" });
  });

  test("opens upwards rather than off the bottom of the screen", async ({ page }) => {
    // A short window, with the field scrolled to its foot.
    await page.setViewportSize({ width: 1100, height: 520 });
    const field = page.getByLabel(INTAKE.aiUse);
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
