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
