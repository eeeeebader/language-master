import { expect, test } from "@playwright/test";
import { onboard } from "./helpers";

test("dictionary search finds words by Spanish and German and adds a card variant to a list", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("link", { name: "Wörterbuch" }).click();
  const search = page.getByPlaceholder("Spanisch oder Deutsch suchen …");
  await search.fill("Hund");
  await expect(page.getByText(/^el\s+perro$/).first()).toBeVisible();
  // accent-insensitive: "manzana" without worrying about diacritics, "adios" finds "adiós"
  await search.fill("adios");
  await expect(page.getByText(/^el\s+adiós$|^adiós$/).first()).toBeVisible();

  // add "el perro" to a new list through the variant picker
  await search.fill("perro");
  await expect(page.getByText(/^el\s+perro$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Zur Liste hinzufügen" }).first().click();
  await expect(page.getByText("Welche Form möchtest du lernen?")).toBeVisible();
  // "Mit Artikel" is preselected for nouns; no click needed
  await expect(page.getByRole("button", { name: /Mit Artikel/ })).toBeVisible();
  await page.getByRole("button", { name: "Neue Liste" }).click();
  await page.getByPlaceholder("Titel").fill("Tiere");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: "Zur Liste hinzufügen" }).last().click();
  await expect(page.getByText("Hinzugefügt")).toBeVisible();

  await page.getByRole("link", { name: "Karteikarten" }).click();
  await expect(page.getByText("Tiere")).toBeVisible();
  await expect(page.getByText(/1 Wörter/)).toBeVisible();
});
