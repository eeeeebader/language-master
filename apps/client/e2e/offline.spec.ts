import { expect, test } from "@playwright/test";
import { onboard } from "./helpers";

test("learning keeps working without a network connection", async ({ page, context }) => {
  await onboard(page);
  // let the service worker finish precaching the bundle before cutting the network
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return !!reg?.active;
  });
  await context.setOffline(true);
  // a full reload offline is served by the service worker; then local data only
  await page.reload();
  await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible();
  await page.getByRole("link", { name: "Wörterbuch" }).click();
  await page.getByPlaceholder("Spanisch oder Deutsch suchen …").fill("hablar");
  await expect(page.getByText("hablar", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Karteikarten" }).click();
  await page.getByText("Erste Wörter", { exact: true }).click();
  await page.getByRole("button", { name: /^Üben/ }).click();
  await expect(page).toHaveURL(/karteikarten\/practice/);
  await page.getByText("Klassisch", { exact: true }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await page.getByRole("button", { name: "Antwort zeigen" }).click();
  await page.getByText("Gut", { exact: true }).click();
  await expect(page.getByText(/übrig/)).toBeVisible();
  await context.setOffline(false);
});
