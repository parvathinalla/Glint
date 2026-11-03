import {test,expect} from "@playwright/test";

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem("glint-key-gate","1");
    sessionStorage.setItem("glint-started","1");
  });
});

test("labelled replay opens with no connected key and no provider dispatch",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("Meta API + browser speech");
  await page.getByRole("button",{name:"Open fixture replay · no key, no AI inference"}).click();
  await expect(page.getByRole("heading",{name:"Build a little desk organizer"})).toBeVisible();
  await expect(page.getByText("GUIDED EXAMPLE · ORIGINAL DEMO INSTRUCTIONS")).toBeVisible();
  await page.getByRole("button",{name:"Confirm this exact source",exact:true}).click();
  await page.getByRole("button",{name:"Start replay",exact:true}).click();
  await page.getByRole("button",{name:"Check now",exact:true}).click();
  await page.getByText("Evidence and limits",{exact:true}).click();
  await expect(page.getByText("Illustrated replay; no real activity observed.",{exact:true})).toBeVisible();
  const state=await (await page.request.get("/api/session")).json();
  expect(state.key.connected).toBe(false);
  expect(state.calls).toBe(0);
  expect((await (await page.request.get("/api/livekit/config")).json()).enabled).toBe(false);
});

test("submission camera skips pose and conversation requests browser speech",async({page,context})=>{
  await context.grantPermissions(["camera"]);
  const forbidden:string[]=[];
  page.on("request",request=>{if(/vision-observer\.js|\/api\/speech$/.test(request.url()))forbidden.push(request.url());});
  await page.routeWebSocket("**/events",()=>{});
  await page.route("**/api/session",async route=>{
    const state=await (await route.fetch()).json();
    state.key={connected:true,models:["muse-spark-1.3"]};
    await route.fulfill({json:state});
  });
  let requestedVoice:string|undefined;
  await page.route("**/api/agent/stream",async route=>{
    const input=route.request().postDataJSON();requestedVoice=input.voice;
    await route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"voice",mode:"none"})}\n\ndata: ${JSON.stringify({type:"done",reply:{message:"Fixture answer, not live inference.",sources:[],searched:false,epoch:input.epoch}})}\n\n`});
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  await expect(page.getByRole("button",{name:"Stop camera",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Open conversation",exact:true}).click();
  await page.getByRole("textbox",{name:"Message Glint",exact:true}).fill("What is the next step?");
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByText("Fixture answer, not live inference.",{exact:true})).toBeVisible();
  expect(requestedVoice).toBe("off");
  expect(forbidden).toEqual([]);
});

test("submission never silently uploads recorded audio as recovery",async({page,context})=>{
  await context.grantPermissions(["microphone"]);
  await page.addInitScript(()=>{
    localStorage.setItem("glint-streaming-voice","0");
    localStorage.setItem("glint-ml-vad","0");
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>{
      if(!constraints?.audio)return original(constraints);
      const audio=new AudioContext(),output=audio.createMediaStreamDestination(),gain=audio.createGain(),oscillator=audio.createOscillator();
      gain.gain.value=0;oscillator.frequency.value=220;oscillator.connect(gain);gain.connect(output);oscillator.start();await audio.resume();
      (window as unknown as {say:()=>void}).say=()=>{gain.gain.setValueAtTime(.12,audio.currentTime);gain.gain.setValueAtTime(0,audio.currentTime+.8);};
      return output.stream;
    };
  });
  await page.routeWebSocket("**/events",()=>{});
  let state:Record<string,unknown>;
  await page.route("**/api/session",async route=>{state=await (await route.fetch()).json();state.key={connected:true,models:["muse-spark-1.3"]};await route.fulfill({json:state});});
  await page.route("**/api/phase",async route=>{state.epoch=Number(state.epoch)+1;await route.fulfill({json:state});});
  const uploads:string[]=[];
  page.on("request",request=>{if(/\/api\/(voice|speech|agent\/stream)$/.test(request.url()))uploads.push(request.url());});
  await page.goto("/");
  await page.getByRole("button",{name:"Talk to Glint",exact:true}).click();
  await expect(page.getByRole("button",{name:"End voice chat",exact:true})).toBeVisible();
  await page.evaluate(()=>(window as unknown as {say:()=>void}).say());
  await expect(page.getByText("Live transcription unavailable. Repeat your question or use Conversation. Recording fallback is off in this profile.",{exact:true})).toBeVisible();
  expect(uploads).toEqual([]);
});
