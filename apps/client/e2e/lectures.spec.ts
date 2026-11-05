import { expect, test } from "@playwright/test";
import { onboard } from "./helpers";

test("a lecture can be opened from the path and finished with its quick check", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("link", { name: "Lektionen" }).click();
  await page.locator("svg text", { hasText: "Alphabet und Laute" }).click();
  await expect(page).toHaveURL(/lectures\/alphabet/);
  await expect(page.getByText("Kurzer Check")).toBeVisible();
  // answer the three questions (any option), then confirm
  await page.getByRole("button", { name: "stumm" }).click();
  await page.getByRole("button", { name: "perro", exact: true }).click();
  await page.getByRole("button", { name: "wie j in „ja“" }).click();
  await page.getByRole("button", { name: /richtig · Verstanden/ }).click();
  await expect(page).toHaveURL(/\/lectures$/);
  // the node is marked done on the home dashboard's next-lecture card
  await page.getByRole("link", { name: "Start" }).click();
  await expect(page.getByText("Betonung und Akzente")).toBeVisible();
});
