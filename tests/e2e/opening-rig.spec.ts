import {test,expect} from "./fixture";
test.use({reducedMotion:"reduce"});
for(const theme of ["Light","Dark"] as const) {
  test("approved jelly avatar loads in "+theme,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto("/");
    await page.getByRole("button",{name:"Open settings"}).click();
    await page.getByRole("button",{name:theme,exact:true}).click();
    await page.getByRole("button",{name:"Close settings"}).click();
    const hero=page.locator(".glint-star-scene>img.jelly-star");
    await expect(hero).toBeVisible();
    await expect.poll(()=>hero.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(hero).toHaveAttribute("src","/avatars/glint-jelly-sky-champagne-v1.png");
    await expect(page.locator(".glint-brand>img.jelly-star")).toBeVisible();
    await expect(page.locator(".silver-star-canvas")).toHaveCount(0);
    const before=await hero.screenshot();
    await page.waitForTimeout(150);
    expect(await hero.screenshot()).toEqual(before);
    await page.screenshot({path:"test-results/mascot-"+theme.toLowerCase()+".png"});
  });
}
