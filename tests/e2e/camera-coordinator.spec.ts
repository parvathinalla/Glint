import {test,expect,type Page} from "./fixture";
import {typeMessage,closeConversation,setSpokenReplies} from "./ui-helpers";
import AxeBuilder from "@axe-core/playwright";
test.use({reducedMotion:"reduce",viewport:{width:390,height:844}});
async function setup(page:Page,camera=true){
 await page.addInitScript(()=>{localStorage.setItem("glint-camera-tools","1");localStorage.setItem("glint-ml-vad","0");localStorage.setItem("glint-streaming-voice","0");});
 // Match production's connection policy: local data images must not use fetch.
 await page.route("**/",async route=>{
  if(route.request().resourceType()!=="document")return route.continue();
  const response=await route.fetch();
  await route.fulfill({response,headers:{...response.headers(),"content-security-policy":"connect-src 'self'"}});
 });
 let session:Record<string,unknown>;
 await page.routeWebSocket("**/events",()=>{});
 await page.route("**/api/session",async route=>{session=await(await route.fetch()).json();session.key={connected:true,models:["muse-spark-test"]};await route.fulfill({json:session});});
 await page.route("**/api/phase",async route=>{session.epoch=Number(session.epoch)+1;await route.fulfill({json:session});});
 await page.route("**/api/vision/stop",route=>route.fulfill({json:session}));
 await page.route("**/api/observe",route=>route.fulfill({status:409,json:{message:"Observation paused in fixture"}}));
 await page.goto("/");await setSpokenReplies(page,false);
 if(camera){await page.getByRole("button",{name:"Open camera",exact:true}).click();await expect.poll(()=>page.getByLabel("Your live camera preview",{exact:true}).evaluate(node=>(node as HTMLVideoElement).readyState),{timeout:12000}).toBeGreaterThanOrEqual(2);}
}
async function image(page:Page){return page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=40;canvas.height=40;const ctx=canvas.getContext("2d")!;ctx.fillStyle="blue";ctx.fillRect(0,0,40,40);return canvas.toDataURL("image/png");});}
async function ask(page:Page,text:string){await typeMessage(page,text);await page.getByRole("button",{name:"Send message",exact:true}).click();}
test("an image request captures, generates and opens over the camera without photo or submit clicks",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);const edited=await image(page);let calls=0,plans=0;
 await page.route("**/api/agent/stream",route=>{plans++;const body=route.request().postDataJSON();expect(body.cameraTools.camera).toBe(true);return route.fulfill({json:{message:"I’ll create the fairy look.",sources:[],searched:false,epoch:body.epoch,action:{id:"image-1",name:"edit_camera_image",args:{prompt:"Fairy makeup and silver accessories",source:"camera"}}}});});
 await page.route("**/api/look-preview",route=>{calls++;const body=route.request().postDataJSON();expect(body.consent).toBe(true);expect(body.photo).toMatch(/^data:image\/jpeg;base64,/);return route.fulfill({json:{image:edited,epoch:body.epoch}});});
 await ask(page,"Show me fairy makeup on me");
 const result=page.getByRole("dialog",{name:"Camera task result",exact:true});await expect(result).toBeVisible();
 await expect(result.getByAltText("Generated camera image")).toBeVisible();expect(calls).toBe(1);expect(plans).toBe(1);
 await expect(page.getByRole("dialog",{name:"Conversation",exact:true})).not.toBeVisible();
 await expect(page.getByRole("button",{name:"Generate preview",exact:true})).toHaveCount(0);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await result.getByRole("button",{name:"Close camera result",exact:true}).click();await expect(result).not.toBeVisible();
 await expect(page.getByRole("button",{name:"Stop camera",exact:true})).toBeVisible();
});
test("a request to show a visible issue marks the supplied frame and never generates a replacement",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);let imageCalls=0,reference="";
 await page.route("**/api/look-preview",route=>{imageCalls++;return route.fulfill({status:500});});
 await page.route("**/api/agent/stream",route=>{const body=route.request().postDataJSON();reference=body.frames[body.frames.length-1].image;return route.fulfill({json:{message:"Check the marked visible area.",sources:[],searched:false,epoch:body.epoch,action:{id:"mark-1",name:"annotate_camera_frame",args:{frameIndex:body.frames.length-1,summary:"This is the visible area to check; a clearer side view is needed to assess the full movement.",confidence:"medium",marks:[{x:.2,y:.3,width:.2,height:.2,label:"Visible area to check"}]}}}});});
 await ask(page,"Show me where the position is wrong");
 const result=page.getByRole("dialog",{name:"Camera task result",exact:true});await expect(result).toBeVisible();
 await expect(result.getByAltText("Captured camera evidence with numbered marks")).toHaveAttribute("src",reference);
 await expect(result.locator("svg rect")).toHaveCount(1);expect(imageCalls).toBe(0);
 await expect(result.getByText("Visible area to check",{exact:true})).toBeVisible();
 await result.getByRole("button",{name:"Close camera result",exact:true}).click();
 await page.getByRole("button",{name:"Open conversation",exact:true}).click();
 await expect(page.getByRole("log",{name:"Conversation with Glint"}).getByText("This is the visible area to check; a clearer side view is needed to assess the full movement.",{exact:true})).toHaveCount(1);
 await expect(page.getByRole("log",{name:"Conversation with Glint"}).getByText(/^Marked camera evidence\./)).toHaveCount(0);
});
test("canceling an in-flight generation discards its late result",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);const edited=await image(page);let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"I’ll create it.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"slow-1",name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}}}}));
 await page.route("**/api/look-preview",async route=>{calls++;await gate;await route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}}).catch(()=>{});});
 await ask(page,"Show the fairy look");await expect.poll(()=>calls).toBe(1);
 await page.getByRole("button",{name:"Cancel camera task",exact:true}).click();release();
 await expect(page.getByRole("dialog",{name:"Camera task result",exact:true})).not.toBeVisible();
 await expect(page.getByRole("button",{name:"Stop camera",exact:true})).toBeVisible();
});
test("a missing camera asks for camera access rather than silently capturing or generating",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page,false);let calls=0;const edited=await image(page);
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"I need your camera view.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"missing-1",name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}}}}));
 await page.route("**/api/look-preview",route=>{calls++;return route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}});});
 await ask(page,"Create the fairy look");await expect(page.getByRole("button",{name:"Open camera for this task",exact:true})).toBeVisible();expect(calls).toBe(0);
 await page.getByRole("button",{name:"Open camera for this task",exact:true}).click();await expect(page.getByAltText("Generated camera image")).toBeVisible();expect(calls).toBe(1);
});
test("a scheduled check runs once and shows an uncertainty result without inventing an alert",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);let checks=0;
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"I’ll check in five seconds.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"check-1",name:"schedule_camera_check",args:{condition:"The lamp is off",seconds:5,alertIf:"not_met"}}}}));
 await page.route("**/api/condition-check",route=>{checks++;const body=route.request().postDataJSON();expect(Date.now()-body.capturedAt).toBeLessThan(5000);return route.fulfill({json:{verdict:"uncertain",summary:"The lamp is not visible in this frame.",epoch:body.epoch,capturedAt:body.capturedAt}});});
 await ask(page,"Check if the lamp is off in five seconds");await expect(page.getByText("Camera check scheduled",{exact:true})).toBeVisible();expect(checks).toBe(0);
 await expect(page.getByRole("heading",{name:"Could not verify",exact:true})).toBeVisible({timeout:12000});expect(checks).toBe(1);
});
test("stopping the camera cancels its scheduled check",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);let checks=0;
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"I’ll check in five seconds.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"check-stop",name:"schedule_camera_check",args:{condition:"Lamp off",seconds:5,alertIf:"not_met"}}}}));
 await page.route("**/api/condition-check",route=>{checks++;return route.fulfill({status:500});});
 await ask(page,"Check the lamp in five seconds");await expect(page.getByText("Camera check scheduled",{exact:true})).toBeVisible();
 await closeConversation(page);await page.getByRole("button",{name:"Stop camera",exact:true}).click();
 await expect(page.getByText("Check canceled",{exact:true})).toBeVisible();await page.waitForTimeout(5500);expect(checks).toBe(0);
});
test("a voice request generates on the camera screen without opening Conversation",async({page,context})=>{
 await context.grantPermissions(["camera","microphone"]);
 await page.addInitScript(()=>{
  const actual=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{
   if(!constraints?.audio||constraints.video)return actual(constraints);
   const audio=new AudioContext(),destination=audio.createMediaStreamDestination(),gain=audio.createGain(),tone=audio.createOscillator();
   gain.gain.value=0;tone.frequency.value=220;tone.connect(gain);gain.connect(destination);tone.start();await audio.resume();
   (window as unknown as {say:()=>void}).say=()=>{gain.gain.setValueAtTime(.12,audio.currentTime);gain.gain.setValueAtTime(0,audio.currentTime+.8);};return destination.stream;
  };
 });
 await setup(page);const edited=await image(page);let calls=0;
 await page.route("**/api/voice",route=>route.fulfill({json:{transcript:"Show me fairy makeup on me",epoch:route.request().postDataJSON().epoch}}));
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"I’ll create it.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"voice-edit",name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}}}}));
 await page.route("**/api/look-preview",route=>{calls++;return route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}});});
 await page.getByRole("button",{name:"Talk to Glint",exact:true}).click();await expect(page.getByRole("button",{name:"End voice chat",exact:true})).toBeVisible();
 await page.waitForTimeout(600);await page.evaluate(()=>(window as unknown as {say:()=>void}).say());
 await expect(page.getByAltText("Generated camera image")).toBeVisible({timeout:12000});expect(calls).toBe(1);
 await expect(page.getByRole("dialog",{name:"Conversation",exact:true})).not.toBeVisible();
});
test("switching the camera while generating clears progress and discards the old result",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);const edited=await image(page);let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"I’ll create it.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"flip-edit",name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}}}}));
 await page.route("**/api/look-preview",async route=>{calls++;await gate;await route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}}).catch(()=>{});});
 await ask(page,"Create a fairy makeup preview");await expect.poll(()=>calls).toBe(1);
 await page.getByRole("button",{name:"Switch to front camera",exact:true}).click();release();
 await expect(page.getByRole("status",{name:"Camera task status"})).not.toBeVisible();
 await expect(page.getByAltText("Generated camera image")).toHaveCount(0);
});
test("provider rejection reports failure once without claiming an image exists",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);let calls=0;
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"I’ll create it.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"denied-edit",name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}}}}));
 await page.route("**/api/look-preview",route=>{calls++;return route.fulfill({status:403,json:{message:"Muse Image access was not accepted."}});});
 await ask(page,"Create a fairy look");await expect(page.getByRole("heading",{name:"Task could not finish",exact:true})).toBeVisible();
 await expect(page.getByText("Muse Image access was not accepted.",{exact:true})).toBeVisible();expect(calls).toBe(1);await expect(page.getByAltText("Generated camera image")).toHaveCount(0);
});

test("progress questions preserve generation and do not dispatch another model call",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);const edited=await image(page);
 let plans=0,calls=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route("**/api/agent/stream",route=>{plans++;return route.fulfill({json:{message:"Creating the wave illustration.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"progress-image",name:"edit_camera_image",args:{prompt:"A friendly wave",source:"camera"}}}});});
 await page.route("**/api/look-preview",async route=>{calls++;await gate;return route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}});});
 await ask(page,"Create a wave image");await expect.poll(()=>calls).toBe(1);
 await ask(page,"Is my image ready?");
 await expect(page.getByText("Your image is still being created. I’m listening while it runs.",{exact:true})).toBeVisible();
 expect(plans).toBe(1);expect(calls).toBe(1);release();
 const result=page.getByRole("dialog",{name:"Camera task result",exact:true});await expect(result.getByAltText("Generated camera image")).toBeVisible();
 await result.getByRole("button",{name:"Close camera result",exact:true}).click();
 await ask(page,"Have you finished the image?");await expect(page.getByText("Your image is ready.",{exact:true})).toBeVisible();
 expect(plans).toBe(1);expect(calls).toBe(1);
});
test("camera awareness is off by default and explicitly enabled by the user",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);let checks=0;
 await page.route("**/api/observe",route=>{checks++;return route.fulfill({status:409,json:{message:"Check observed"}});});
 await page.waitForTimeout(4500);expect(checks).toBe(0);
 await page.getByRole("button",{name:"Open settings",exact:true}).click();
 await page.getByRole("checkbox",{name:/Background camera checks/}).check();
 await expect.poll(()=>checks).toBe(1);
});
