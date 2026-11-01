import {readFileSync} from "node:fs";
import {test,expect,type Page} from "./fixture";
import {setSpokenReplies,typeMessage,closeConversation} from "./ui-helpers";
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
test("a spoken status question is answered before generation finishes without starting another image",async({page,context})=>{
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
 await setup(page);const edited=await image(page);let calls=0,plans=0,transcripts=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route("**/api/voice",route=>route.fulfill({json:{transcript:++transcripts===1?"Show me fairy makeup on me":"Is my image ready?",epoch:route.request().postDataJSON().epoch}}));
 await page.route("**/api/agent/stream",route=>{plans++;return route.fulfill({json:{message:"I’ll create it.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"voice-edit",name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}}}});});
 await page.route("**/api/look-preview",async route=>{calls++;await gate;return route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}}).catch(()=>{});});
 await page.getByRole("button",{name:"Talk to Glint",exact:true}).click();await expect(page.getByRole("button",{name:"End voice chat",exact:true})).toBeVisible();
 await page.waitForTimeout(600);await page.evaluate(()=>(window as unknown as {say:()=>void}).say());
 await expect.poll(()=>calls).toBe(1);
 await page.evaluate(()=>(window as unknown as {say:()=>void}).say());
 await expect.poll(()=>transcripts,{timeout:10000}).toBe(2);
 await page.getByRole("button",{name:"Open conversation",exact:true}).click();
 await expect(page.getByText("Your image is still being created. I’m listening while it runs.",{exact:true})).toBeVisible();
 expect(plans).toBe(1);expect(calls).toBe(1);
 await closeConversation(page);release();
 await expect(page.getByAltText("Generated camera image")).toBeVisible({timeout:12000});
 await expect.poll(()=>transcripts).toBe(2);expect(calls).toBe(1);expect(plans).toBe(1);
 await expect(page.getByRole("dialog",{name:"Conversation",exact:true})).not.toBeVisible();
});
test("the explicit allowance reset disconnects the key and stops the camera",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);
 await page.getByRole("button",{name:"Open settings",exact:true}).click();
 await page.getByRole("button",{name:"Start a new call allowance",exact:true}).click();
 await expect(page.getByRole("button",{name:"Open camera",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Open settings",exact:true}).click();
 await expect(page.getByRole("button",{name:/Connect model/})).toBeVisible();
 await expect(page.getByText("0 of 100 session calls used. Camera checks also use this allowance.",{exact:true})).toBeVisible();
});

test("diagnostic export contains routing events but no conversation text",async({page})=>{
 await setup(page,false);
 await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"Fixture answer",sources:[],searched:false,epoch:route.request().postDataJSON().epoch}}));
 await page.getByRole("button",{name:"Open conversation",exact:true}).click();
 await page.getByRole("textbox",{name:"Message Glint",exact:true}).fill("PRIVATE_TEST_CONVERSATION_DO_NOT_LOG");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect(page.getByText("Fixture answer",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Close conversation",exact:true}).click();
 await page.getByRole("button",{name:"Open settings",exact:true}).click();
 await page.getByText("Diagnostic trace",{exact:true}).click();
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download diagnostic trace",exact:true}).click();
 const download=await pending,path=await download.path();expect(path).toBeTruthy();
 const text=readFileSync(path!,"utf-8"),report=JSON.parse(text);
 expect(text).not.toContain("PRIVATE_TEST_CONVERSATION_DO_NOT_LOG");
 expect(report.browser.some((event:{operation:string})=>event.operation==="agent/stream")).toBe(true);
 expect(report.server.trace).toBeTruthy();
});

test("a spoken cancel stops image generation while the microphone stays on",async({page,context})=>{
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
 await setup(page);const edited=await image(page);let calls=0,plans=0,transcripts=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route("**/api/voice",route=>route.fulfill({json:{transcript:++transcripts===1?"Show me fairy makeup on me":"Cancel the image",epoch:route.request().postDataJSON().epoch}}));
 await page.route("**/api/agent/stream",route=>{plans++;return route.fulfill({json:{message:"I’ll create it.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch,action:{id:"voice-edit",name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}}}});});
 await page.route("**/api/look-preview",async route=>{calls++;await gate;return route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}}).catch(()=>{});});
 await page.getByRole("button",{name:"Talk to Glint",exact:true}).click();await expect(page.getByRole("button",{name:"End voice chat",exact:true})).toBeVisible();
 await page.waitForTimeout(600);await page.evaluate(()=>(window as unknown as {say:()=>void}).say());
 await expect.poll(()=>calls).toBe(1);
 await page.evaluate(()=>(window as unknown as {say:()=>void}).say());
 await expect.poll(()=>transcripts,{timeout:10000}).toBe(2);
 await page.getByRole("button",{name:"Open conversation",exact:true}).click();
 await expect(page.getByText("The camera task was canceled.",{exact:true})).toBeVisible();
 expect(plans).toBe(1);expect(calls).toBe(1);release();
 await closeConversation(page);
 await expect(page.getByAltText("Generated camera image")).toHaveCount(0);
 await expect(page.getByRole("button",{name:"End voice chat",exact:true})).toBeVisible();
});

test("ordinary questions are answered while the same image keeps generating",async({page,context})=>{
 await context.grantPermissions(["camera"]);await setup(page);const edited=await image(page);
 let plans=0,calls=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route("**/api/agent/stream",route=>{
  plans++;const body=route.request().postDataJSON();
  if(body.cameraTools.imageInProgress){expect(body.question).toBe("How do I wave?");return route.fulfill({json:{message:"Move your hand side to side.",sources:[],searched:false,epoch:body.epoch}});}
  return route.fulfill({json:{message:"INTERNAL_PROMPT_MUST_NOT_BE_READ",sources:[],searched:false,epoch:body.epoch,action:{id:"chat-image",name:"edit_camera_image",args:{prompt:"INTERNAL_PROMPT_MUST_NOT_BE_READ",source:"camera"}}}});
 });
 await page.route("**/api/look-preview",async route=>{calls++;await gate;return route.fulfill({json:{image:edited,epoch:route.request().postDataJSON().epoch}});});
 await typeMessage(page,"Create a greeting image");await page.getByRole("button",{name:"Send message",exact:true}).click();await expect.poll(()=>calls).toBe(1);
 await typeMessage(page,"How do I wave?");await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect(page.getByText("Move your hand side to side.",{exact:true})).toBeVisible();
 await expect(page.getByText("INTERNAL_PROMPT_MUST_NOT_BE_READ",{exact:true})).toHaveCount(0);
 expect(plans).toBe(2);expect(calls).toBe(1);await closeConversation(page);release();
 await expect(page.getByAltText("Generated camera image")).toBeVisible();
});
