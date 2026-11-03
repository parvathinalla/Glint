import {test,expect} from "@playwright/test";
for(const motion of ["reduce","no-preference"] as const) {
  test("website opens directly without a walking intro: "+motion,async({page})=>{
    await page.emulateMedia({reducedMotion:motion});
    await page.addInitScript(()=>{
      localStorage.setItem("glint-key-gate", "1");
      localStorage.setItem("glint-camera-tools", "0");
      (window as unknown as {mediaRequests:number}).mediaRequests=0;
      navigator.mediaDevices.getUserMedia=async()=>{
        (window as unknown as {mediaRequests:number}).mediaRequests++;
        throw Error("Media must be requested explicitly");
      };
    });
    await page.goto("/");
    await expect(page).toHaveTitle("Glint");
    await expect(page.getByTestId("opening")).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Start Glint",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>(window as unknown as {mediaRequests:number}).mediaRequests)).toBe(0);
    await page.getByRole("button",{name:"Start Glint",exact:true}).click();
    await expect(page.getByRole("button",{name:"Talk to Glint",exact:true})).toBeVisible();
    await expect(page.getByText("Or type a message…",{exact:true})).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button",{name:"Start Glint",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Talk to Glint",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Open conversation",exact:true}).click();
    await expect(page.getByRole("textbox",{name:"Message Glint",exact:true})).toBeVisible();
  });
}
