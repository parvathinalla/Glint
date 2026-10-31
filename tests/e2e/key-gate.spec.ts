import { test, expect } from "@playwright/test";
test.use({ reducedMotion: "reduce" });

test("first visit asks for the API key before the site can be used", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Meta Model API" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toHaveCount(0);
  const reloaded = page.waitForResponse("**/api/session");
  await page.reload();
  await reloaded;
  await page.waitForTimeout(1500);
  await expect(
    page.getByRole("dialog", { name: "Meta Model API" }),
  ).toHaveCount(0);
});

test("connected key skips the upfront gate", async ({ page }) => {
  await page.route("**/api/session", async (route) => {
    const view = await (await route.fetch()).json();
    view.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: view });
  });
  await page.goto("/");
  await page.waitForResponse("**/api/session");
  await page.waitForTimeout(1500);
  await expect(
    page.getByRole("dialog", { name: "Meta Model API" }),
  ).toHaveCount(0);
});
