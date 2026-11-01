import {test,expect} from "./fixture";
test.use({reducedMotion:"reduce"});
for(const theme of ["Light","Dark"] as const) {
  test("glossy companion renders with independent SVG lighting in "+theme,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto("/");
    await page.getByRole("button",{name:"Open settings"}).click();
    await page.getByRole("button",{name:theme,exact:true}).click();
    await page.getByRole("button",{name:"Close settings"}).click();
    await expect(page.getByTestId("opening")).toHaveCount(0);
    const valid=await page.evaluate(()=>{
      const nodes=[...document.querySelectorAll("svg.spark")];
      const ids=nodes.flatMap(svg=>[...svg.querySelectorAll("[id]")].map(node=>node.id));
      return nodes.length>=2 && new Set(ids).size===ids.length && nodes.every(svg=>{
        return [...svg.querySelectorAll("[fill],[filter]")].every(node=>{
          return ["fill","filter"].every(name=>{
            const id=node.getAttribute(name)?.match(/^url\(#(.+)\)$/)?.[1];
            return !id || !!document.getElementById(id);
          });
        });
      });
    });
    expect(valid).toBe(true);
    await page.screenshot({path:"test-results/mascot-"+theme.toLowerCase()+".png"});
  });
}
test("silver companion stays still for reduced motion and falls back on GPU loss",async({page})=>{
  await page.goto("/");
  const hero=page.locator(".glint-star-scene>.silver-star");
  await expect(hero).toBeVisible();
  const available=await hero.locator("canvas").evaluate(node=>!!(node as HTMLCanvasElement).getContext("webgl"));
  if(available){
    await expect(hero).toHaveClass(/silver-star-ready/);
    const first=await hero.screenshot();
    await page.waitForTimeout(250);
    expect(await hero.screenshot()).toEqual(first);
    await hero.locator("canvas").evaluate(node=>{
      (node as HTMLCanvasElement).getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await expect(hero).not.toHaveClass(/silver-star-ready/);
  }
  await expect(hero.locator(".silver-star-fallback>svg")).toBeVisible();
});
