import {test,expect,type Page} from "./fixture";
import {typeMessage} from "./ui-helpers";
test.use({reducedMotion:"reduce",viewport:{width:390,height:844}});
async function setup(page:Page){
  let session:Record<string,unknown>;
  await page.routeWebSocket("**/events",()=>{});
  await page.route("**/api/session",async route=>{session=await(await route.fetch()).json();session.key={connected:true,models:["muse-spark-test"]};await route.fulfill({json:session});});
  await page.route("**/api/phase",async route=>{session.epoch=Number(session.epoch)+1;await route.fulfill({json:session});});
  await page.route("**/api/observe",route=>route.fulfill({status:409,json:{message:"Observation paused in fixture"}}));
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
  await page.getByRole("button",{name:"Yes, preview the look"}).click();expect(calls).toBe(0);
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
  await page.getByRole("button",{name:"Yes, preview the look"}).click();
  await page.getByLabel("Choose a photo",{exact:true}).setInputFiles({name:"portrait.png",mimeType:"image/png",buffer:Buffer.from(original.split(",")[1],"base64")});
  await page.getByRole("button",{name:"Generate preview",exact:true}).click();await expect.poll(()=>calls).toBe(1);
  await page.getByRole("button",{name:"Cancel generation"}).click();release();
  await expect(page.getByText("Preview canceled.",{exact:true})).toBeVisible();
  await expect(page.getByAltText("Generated look preview")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Generate preview",exact:true})).toBeEnabled();
});
test("fairy conversation remembers style and opens photo controls when asked for an image",async({page})=>{
  await setup(page);let imageCalls=0,textCalls=0;
  await page.route("**/api/look-preview",route=>{imageCalls++;return route.fulfill({status:500});});
  await page.route("**/api/agent/stream",route=>{textCalls++;return route.fulfill({status:500});});
  const say=async(text:string)=>{await typeMessage(page,text);await page.getByRole("button",{name:"Send message",exact:true}).click();};
  await say("Which Halloween look suits me?");
  await say("fantasy makeup");await say("I want fairy.");
  await say("I don't have anything right now, just you create a image I will see if that looks good I will go and buy the stuff");
  await expect(page.getByLabel("Choose a photo",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Describe the look")).toHaveValue(/fairy/);
  await say("can I choose a photo?");await say("No.");
  await expect(page.getByRole("region",{name:"Look preview"})).toBeVisible();
  expect(textCalls).toBe(0);expect(imageCalls).toBe(0);
  const reference=await photo(page,"red");
  await page.getByLabel("Choose a photo",{exact:true}).setInputFiles({name:"portrait.png",mimeType:"image/png",buffer:Buffer.from(reference.split(",")[1],"base64")});
  await expect(page.getByAltText("Selected reference photo")).toBeVisible();
  await say("Make the cape purple");
  await expect(page.getByAltText("Selected reference photo")).toBeVisible();
  await expect(page.getByLabel("Describe the look")).toHaveValue(/purple/);
  await page.getByLabel("Describe the look").fill("");
  await expect(page.getByAltText("Selected reference photo")).toBeVisible();
  await expect(page.getByRole("button",{name:"Generate preview",exact:true})).toBeDisabled();
  await page.getByLabel("Describe the look").fill("Fairy makeup with a purple cape");
  await expect(page.getByRole("button",{name:"Generate preview",exact:true})).toBeEnabled();
  expect(textCalls).toBe(0);expect(imageCalls).toBe(0);
});
test("captures the existing Glint camera view and sends only the reviewed frame",async({page,context})=>{
  await context.grantPermissions(["camera"]);await setup(page);
  let calls=0,reference="";const edited=await photo(page,"blue");
  await page.route("**/api/look-preview",async route=>{calls++;const body=route.request().postDataJSON();reference=body.photo;await route.fulfill({json:{image:edited,epoch:body.epoch}});});
  await typeMessage(page,"Which Halloween look suits me?");await page.getByRole("button",{name:"Send message",exact:true}).click();
  await page.getByRole("button",{name:"Yes, preview the look"}).click();
  await page.getByRole("button",{name:"Open Glint camera"}).click();
  const live=page.getByLabel("Live camera for look preview",{exact:true});
  await expect(live).toBeVisible();await expect.poll(()=>live.evaluate(node=>(node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(()=>{
    const main=document.querySelector("video[aria-label='Your live camera preview']") as HTMLVideoElement;
    const preview=document.querySelector("video[aria-label='Live camera for look preview']") as HTMLVideoElement;
    return !!main.srcObject && main.srcObject===preview.srcObject;
  })).toBe(true);
  await expect(page.locator("input[capture]")).toHaveCount(0);
  await page.getByRole("button",{name:"Capture camera view",exact:true}).click();
  const selected=page.getByAltText("Selected reference photo");await expect(selected).toBeVisible();
  const reviewed=await selected.getAttribute("src");expect(reviewed).toMatch(/^data:image\/jpeg;base64,/);expect(calls).toBe(0);
  await page.getByRole("button",{name:"Generate preview",exact:true}).click();
  await expect(page.getByAltText("Generated look preview")).toBeVisible();expect(calls).toBe(1);expect(reference).toBe(reviewed);
  await page.getByRole("button",{name:"Retake camera view"}).click();
  await expect(page.getByAltText("Generated look preview")).toHaveCount(0);expect(calls).toBe(1);
});
