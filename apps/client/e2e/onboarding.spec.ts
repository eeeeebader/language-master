import { expect, test } from "@playwright/test";
import { onboard } from "./helpers";

test("fresh install goes through onboarding into the guided starter session", async ({ page }) => {
  await onboard(page, "Ada", true);
  await expect(page.getByText(/übrig/)).toBeVisible();
  // classic mode: flip, grade, next card
  await page.getByRole("button", { name: "Antwort zeigen" }).click();
  await page.getByText("Gut", { exact: true }).click();
  await expect(page.getByText(/14 übrig/)).toBeVisible();
  // leaving the onboarding session leads to the tour, then home
  await page.getByRole("button", { name: "Beenden" }).click();
  await expect(page).toHaveURL(/\/tour/);
  await page.getByRole("button", { name: "Überspringen" }).click();
  await expect(page.getByRole("heading", { name: "Hola, Ada" })).toBeVisible();
  await expect(page.getByText("Serie")).toBeVisible();
});

test("the home dashboard and streak settings render after onboarding", async ({ page }) => {
  await onboard(page);
  await expect(page.getByText("Jetzt fällig")).toBeVisible();
  await page.getByText("Serie", { exact: true }).click();
  await expect(page).toHaveURL(/settings\/streak/);
  await expect(page.getByText("Lerntage", { exact: true })).toBeVisible();
});
