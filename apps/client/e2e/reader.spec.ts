import { expect, test } from "@playwright/test";
import { onboard } from "./helpers";

test("the reader shows grammar notes in the drawer and the vocabulary summary after reading", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("link", { name: "Geschichten" }).click();
  await page.getByText("Un día en el mercado").first().click();
  await expect(page).toHaveURL(/stories\/es-official-mercado/);
  await expect(page.getByText(/bekannt/)).toBeVisible();

  await page.locator("article span", { hasText: /^va$/ }).first().click();
  await expect(page.getByText("Im Kontext")).toBeVisible();
  await expect(page.getByText(/ir – Präsens/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("div.fixed.inset-0").click({ position: { x: 5, y: 5 } });

  await page.getByRole("button", { name: "Geschichte gelesen" }).click();
  await expect(page.getByRole("heading", { name: "Vokabeln dieser Geschichte" })).toBeVisible();
  await expect(page.getByText(/mercado ×/)).toBeVisible();
});
