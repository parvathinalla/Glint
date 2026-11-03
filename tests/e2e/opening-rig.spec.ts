import {test,expect} from "./fixture";
test.use({reducedMotion:"reduce"});
for(const theme of ["Light","Dark"] as const) {
  test("animated avatar respects reduced motion in "+theme,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto("/");
    await page.getByRole("button",{name:"Open settings"}).click();
    await page.getByRole("button",{name:theme,exact:true}).click();
    await page.getByRole("button",{name:"Close settings"}).click();
    const hero=page.locator(".glint-star-scene>.silver-star");
    await expect(hero).toBeVisible();
    await expect(hero).toHaveClass(/silver-star-ready/);
    await expect(page.locator(".glint-brand>svg.spark-small")).toBeVisible();
    await expect.poll(()=>hero.locator("video").evaluate(node=>(node as HTMLVideoElement).paused)).toBe(true);
    await page.waitForTimeout(200);
    const before=await hero.screenshot();
    await page.waitForTimeout(150);
    expect(await hero.screenshot()).toEqual(before);
    await page.screenshot({path:"test-results/mascot-"+theme.toLowerCase()+".png"});
  });
}

test("avatar animates and retains fallback when video fails",async({page})=>{
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  const hero=page.locator(".glint-star-scene>.silver-star");
  await expect(hero).toHaveClass(/silver-star-ready/);
  await expect.poll(()=>hero.locator("video").evaluate(node=>(node as HTMLVideoElement).currentTime)).toBeGreaterThan(.2);
  await page.route("**/glint-star-animation.mp4",route=>route.abort());
  await page.reload();
  await expect(hero.locator(".silver-star-fallback img")).toBeVisible();
  await expect(hero).not.toHaveClass(/silver-star-ready/);
});

test("loading video does not flash the fallback star",async({page})=>{
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/glint-star-animation.mp4",async route=>{await pending;await route.continue();});
  try {
    await page.goto("/",{waitUntil:"domcontentloaded"});
    const hero=page.locator(".glint-star-scene>.silver-star");
    await expect(hero).toBeVisible();
    await expect(hero.locator(".silver-star-fallback")).toHaveCount(0);
    release();
    await expect(hero).toHaveClass(/silver-star-ready/);
    await expect(hero.locator(".silver-star-fallback")).toHaveCount(0);
  } finally {release();}
});
