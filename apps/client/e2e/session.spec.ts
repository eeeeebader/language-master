import { expect, test } from "@playwright/test";
import { onboard } from "./helpers";

test("reaction-time session infers a grade and allows a one-tap override", async ({ page }) => {
  await onboard(page);
  await page.getByRole("link", { name: "Karteikarten" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByText("Reaktionszeit", { exact: true }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page).toHaveURL(/karteikarten\/session.*mode=reaction/);

  await page.getByRole("button", { name: "Zeigen" }).click();
  await page.getByRole("button", { name: "Richtig" }).click();
  await expect(page.getByText(/Erkannt:/)).toBeVisible();
  // override to Easy and continue
  await page.getByText("Leicht", { exact: true }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByRole("button", { name: "Zeigen" })).toBeVisible();
});

test("progressive mode asks multiple choice first", async ({ page }) => {
  await onboard(page);
  await page.getByRole("link", { name: "Karteikarten" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByText("Auswahl & Tippen", { exact: true }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.getByText("Auswahl", { exact: true })).toBeVisible();
  // four answer buttons under the card
  const choices = page.locator("main button.rounded-chip.bg-paper-2");
  await expect(choices).toHaveCount(4);
});
