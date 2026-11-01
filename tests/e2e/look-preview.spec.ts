import {test,expect,type Page} from "./fixture";
import {typeMessage} from "./ui-helpers";
test.use({reducedMotion:"reduce",viewport:{width:390,height:844}});
async function setup(page:Page){
  let session:Record<string,unknown>;
  await page.routeWebSocket("**/events",()=>{});
  await page.route("**/api/session",async route=>{session=await(await route.fetch()).json();session.key={connected:true,models:["muse-spark-test"]};await route.fulfill({json:session});});
  await page.route("**/api/phase",async route=>{session.epoch=Number(session.epoch)+1;await route.fulfill({json:session});});
  await page.goto("/");
}
async function photo(page:Page,color:string){
  return page.evaluate(color=>{const canvas=document.createElement("canvas");canvas.width=40;canvas.height=40;const ctx=canvas.getContext("2d")!;ctx.fillStyle=color;ctx.fillRect(0,0,40,40);return canvas.toDataURL("image/png");},color);
}
test("photo previews require an offer, selection and explicit generation; refinements use the last preview",async({page})=>{
  let calls=0;const references:string[]=[];
  await setup(page);
  const original=await photo(page,"red"),edited=await photo(page,"blue");
  await page.route("**/api/look-preview",async route=>{
    calls++;const body=route.request().postDataJSON();expect(body.consent).toBe(true);expect(body.photo).toMatch(/^data:image\/jpeg;base64,/);references.push(body.photo);
    await route.fulfill({json:{image:edited,epoch:body.epoch}});
  });
  await typeMessage(page,"Which Halloween look suits me?");await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByRole("region",{name:"Look preview"})).toBeVisible();expect(calls).toBe(0);
  await page.getByRole("button",{name:"Yes, choose a photo"}).click();expect(calls).toBe(0);
  await expect(page.getByRole("button",{name:"Generate preview",exact:true})).toBeDisabled();
  await page.getByLabel("Choose a photo",{exact:true}).setInputFiles({name:"portrait.png",mimeType:"image/png",buffer:Buffer.from(original.split(",")[1],"base64")});
  await expect(page.getByAltText("Selected reference photo")).toBeVisible();expect(calls).toBe(0);
  await page.getByLabel("Describe the look").fill("Celestial witch, navy cape and silver makeup");
  await page.getByRole("button",{name:"Generate preview",exact:true}).click();
  await expect(page.getByAltText("Generated look preview")).toBeVisible();expect(calls).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole("link",{name:"Download preview"})).toHaveAttribute("download","glint-look.png");
  await page.getByLabel("What would you like to change?").fill("Make the cape purple");
  await page.getByRole("button",{name:"Generate updated preview"}).click();
  await expect.poll(()=>calls).toBe(2);expect(references[1]).not.toBe(references[0]);
  await page.getByRole("button",{name:"Close preview"}).click();await expect(page.getByAltText("Selected reference photo")).toHaveCount(0);
});
test("No just ideas makes a text request without asking for photos or generating",async({page})=>{
  let calls=0,textCalls=0;await setup(page);
  await page.route("**/api/look-preview",route=>{calls++;return route.fulfill({status:500});});
  await page.route("**/api/agent/stream",route=>{textCalls++;return route.fulfill({json:{message:"Try a celestial witch or a vampire costume.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch}});});
  await typeMessage(page,"Which Halloween look suits me?");await page.getByRole("button",{name:"Send message",exact:true}).click();
  await page.getByRole("button",{name:"No, just ideas"}).click();
  await expect(page.getByText("Try a celestial witch or a vampire costume.",{exact:true})).toBeVisible();
  expect(calls).toBe(0);expect(textCalls).toBe(1);await expect(page.getByRole("region",{name:"Look preview"})).toHaveCount(0);
});
test("generation can be canceled without displaying its late result",async({page})=>{
  await setup(page);const original=await photo(page,"red");
  let release!:()=>void,calls=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/look-preview",async route=>{calls++;const body=route.request().postDataJSON();await gate;await route.fulfill({json:{image:original,epoch:body.epoch}}).catch(()=>{});});
  await typeMessage(page,"Show a Halloween costume on me");await page.getByRole("button",{name:"Send message",exact:true}).click();
  await page.getByRole("button",{name:"Yes, choose a photo"}).click();
  await page.getByLabel("Choose a photo",{exact:true}).setInputFiles({name:"portrait.png",mimeType:"image/png",buffer:Buffer.from(original.split(",")[1],"base64")});
  await page.getByRole("button",{name:"Generate preview",exact:true}).click();await expect.poll(()=>calls).toBe(1);
  await page.getByRole("button",{name:"Cancel generation"}).click();release();
  await expect(page.getByText("Preview canceled.",{exact:true})).toBeVisible();
  await expect(page.getByAltText("Generated look preview")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Generate preview",exact:true})).toBeEnabled();
});
