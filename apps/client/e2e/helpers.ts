import { expect, type Page } from "@playwright/test";

/** Run onboarding on a fresh profile. With `withSession` the guided starter session is opened. */
export async function onboard(page: Page, name = "Elias", withSession = false) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("textbox").first().fill(name);
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  const boxes = page.getByRole("checkbox");
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByText("Erste Wörter: dich vorstellen")).toBeVisible();
  if (withSession) {
    await page.getByRole("button", { name: "Starten" }).click();
    await expect(page).toHaveURL(/karteikarten\/session/);
  } else {
    await page.getByRole("button", { name: "Überspringen" }).click();
    await expect(page).toHaveURL(/\/tour/);
    await page.getByRole("button", { name: "Überspringen" }).click();
    await expect(page).toHaveURL("/");
  }
}
