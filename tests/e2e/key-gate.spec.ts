import { test, expect } from "@playwright/test";
test.use({reducedMotion:"reduce"});
test("first visit shows welcome; model setup appears only when requested", async ({page}) => {
  await page.goto("/");
  await expect(page.getByRole("dialog",{name:"Meta Model API"})).toHaveCount(0);
  await page.getByRole("button",{name:"Start Glint",exact:true}).click();
  await page.getByRole("button",{name:"Talk to Glint",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Meta Model API"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Close dialog"}).click();
  await expect(dialog).toHaveCount(0);
});
test("connected sessions start without an upfront model dialog", async ({page}) => {
  await page.route("**/api/session",async route=>{
    const view=await(await route.fetch()).json();view.key={connected:true,models:["muse-spark-test"]};await route.fulfill({json:view});
  });
  await page.goto("/");
  await expect(page.getByRole("button",{name:"Start Glint",exact:true})).toBeVisible();
  await expect(page.getByRole("dialog",{name:"Meta Model API"})).toHaveCount(0);
});
