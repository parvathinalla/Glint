import { test, expect } from "./fixture";
import { openConversation, openInstructions, openSettings } from "./ui-helpers";
test.use({reducedMotion:"reduce"});
// Replay invariants remain covered by engine/HTTP tests after removal of demo UI.
test("model key is configured in settings and never stored in browser storage",async({page})=>{
  await page.goto("/");await openSettings(page);
  await page.getByRole("button",{name:/Connect model/}).click();
  await expect(page.locator("#provider-key")).toHaveAttribute("type","password");
  await page.locator("#provider-key").fill("TEST_ONLY_NOT_SUBMITTED");
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain("TEST_ONLY_NOT_SUBMITTED");
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();
});
test("manual link remains optional and requires a model connection",async({page})=>{
  await page.goto("/");await openInstructions(page);
  const dialog=page.getByRole("dialog",{name:"Add instructions link"});
  await expect(dialog.locator("input")).toHaveCount(1);
  await dialog.getByLabel("Product or manual link").fill("https://www.ikea.com/");
  await dialog.getByRole("button",{name:"Let Glint read it"}).click();
  await expect(page.getByRole("dialog",{name:"Meta Model API"})).toBeVisible();
});
test("phone layout stays within viewport with reduced motion",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole("button",{name:"Talk to Glint",exact:true})).toBeVisible();
  await openConversation(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("private application resources are not publicly served",async({request})=>{
  for(const path of ["/.data/glint.sqlite","/server/engine.ts","/.env.local"])
    expect((await request.get(path)).status()).toBe(403);
});
