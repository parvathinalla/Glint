import {test,expect} from "./fixture";
import {setSpokenReplies,typeMessage} from "./ui-helpers";

test("routine tracking waits for consent, keeps observing, and stops on a result request",async({page,context})=>{
  test.setTimeout(60000);
  await context.grantPermissions(["camera"]);
  await page.addInitScript(()=>localStorage.setItem("glint-camera-tools","1"));
  await page.routeWebSocket("**/events",()=>{});
  let state:Record<string,unknown>;let checks=0,sam=0;
  await page.route("**/api/session",async route=>{state=await(await route.fetch()).json();state.key={connected:true,models:["muse-spark-test"]};await route.fulfill({json:state});});
  await page.route("**/api/phase",async route=>{state.epoch=Number(state.epoch)+1;await route.fulfill({json:state});});
  await page.route("**/api/track",async route=>{sam++;await route.fulfill({status:500,json:{message:"Routine must not use SAM object clips"}});});
  await page.route("**/api/activity-check",async route=>{checks++;const input=route.request().postDataJSON();await route.fulfill({json:{activity:"Standing with hands together",scene:"Person visible",changes:[],confidence:"medium",say:null,events:input.checkpoints?.length?[{frameIndex:input.frames.length-1,index:checks===1?0:1,confidence:"high"}]:[],epoch:input.epoch,from:input.frames[0].capturedAt,capturedAt:input.frames.at(-1).capturedAt}});});
  await page.route("**/api/agent/stream",async route=>{
    const input=route.request().postDataJSON();
    // Sampled observation remains available separately from local repetition counting.
    await route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"done",reply:{message:"Object tracking",sources:[],searched:false,epoch:input.epoch,action:{id:"routine-1",name:"start_activity_tracking",args:{goal:"Track movement",checkpoints:["Hands together","Arms raised"]}}}})}\n\n`});
  });
  await page.goto("/");await setSpokenReplies(page,false);
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  await expect.poll(()=>page.getByLabel("Your live camera preview",{exact:true}).evaluate(n=>(n as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await typeMessage(page,"Track Surya Namaskar poses until I ask for results");await page.getByRole("button",{name:"Send message",exact:true}).click();
  const panel=page.getByRole("complementary",{name:"Activity tracking"});
  await expect(panel.getByRole("heading",{name:"Should I track this activity?"})).toBeVisible();
  expect(checks).toBe(0);expect(sam).toBe(0);
  await panel.getByRole("button",{name:"Start tracking",exact:true}).click();
  await expect.poll(()=>checks,{timeout:15000}).toBeGreaterThanOrEqual(2);
  await expect(panel.getByRole("button",{name:"Stop tracking",exact:true})).toBeVisible();  await page.setViewportSize({width:390,height:844});
  const stopBox=await panel.boundingBox();
  expect(stopBox!.height).toBeLessThanOrEqual(48);expect(stopBox!.width).toBeLessThan(110);
  await page.screenshot({path:"test-results/compact-tracking-phone.png",fullPage:true});
  await typeMessage(page,"Show the results");await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("log",{name:"Conversation with Glint"})).toContainText("Observed pose/checkpoint count: 2");
  const stopped=checks;await page.waitForTimeout(3500);expect(checks).toBe(stopped);expect(sam).toBe(0);
});




test("local hand-raise counter counts five cycles without a model call per movement",async({page,context})=>{
  test.setTimeout(60000);
  await context.grantPermissions(["camera"]);
  await page.addInitScript(()=>{
    localStorage.setItem("glint-camera-tools","1");
    const Native=window.Worker;
    window.Worker=class extends Native {
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes("vision-observer"))(window as unknown as {poseWorker:Worker}).poseWorker=this;}
    };
  });
  await page.route("**/vision-observer.js",route=>route.fulfill({contentType:"application/javascript",body:`onmessage=({data})=>{if(data.kind==='init')postMessage({kind:'ready'});if(data.kind==='frame')data.bitmap.close();if(data.kind==='test-pose')postMessage({kind:'pose',landmarks:data.points,at:data.at});};`}));
  await page.routeWebSocket("**/events",()=>{});
  let state:Record<string,unknown>,paidObservations=0,agentCalls=0,lastContext="";
  await page.route("**/api/session",async route=>{state=await(await route.fetch()).json();state.key={connected:true,models:["muse-spark-test"]};await route.fulfill({json:state});});
  await page.route("**/api/phase",async route=>{state.epoch=Number(state.epoch)+1;await route.fulfill({json:state});});
  await page.route(/\/api\/(activity-check|observe|track)$/,async route=>{paidObservations++;await route.fulfill({status:500,json:{message:"Local counting must not dispatch inference"}});});
  await page.route("**/api/agent/stream",async route=>{
    const input=route.request().postDataJSON();agentCalls++;lastContext=input.cameraTools?.lastResult??"";await route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"done",reply:{message:"Should I track this activity?",sources:[],searched:false,epoch:input.epoch,action:{id:"local-1",name:"start_activity_tracking",args:{goal:"Count hand raises",mode:"hand_raises",checkpoints:[]}}}})}\n\n`});
  });
  await page.goto("/");await setSpokenReplies(page,false);
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  await typeMessage(page,"Count my hand raises");await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByRole("button",{name:"Start tracking",exact:true})).toBeVisible();
  await typeMessage(page,"yes");await page.getByRole("button",{name:"Send message",exact:true}).click();
  expect(agentCalls).toBe(1);
  await expect(page.getByLabel("Hand raise count")).toHaveText("0 raises");
  await page.evaluate(()=>{
    const worker=(window as unknown as {poseWorker:Worker}).poseWorker;
    let at=performance.now();
    const hold=(raised:boolean)=>{for(let i=0;i<4;i++){
      const points=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));points[11].y=.4;points[12].y=.4;points[15].y=raised?.2:.7;points[16].y=.7;
      worker.postMessage({kind:"test-pose",points,at});at+=100;
    }};
    hold(false);for(let n=0;n<5;n++){hold(true);hold(false);}
  });
  await expect(page.getByLabel("Hand raise count")).toHaveText("5 raises");
  expect(paidObservations).toBe(0);
  // Even if Spark repeats the start tool, preserve the confirmed session and count.
  await typeMessage(page,"Keep counting please");await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect.poll(()=>agentCalls).toBe(2);
  await expect(page.getByRole("log")).toContainText("Your current tracking session is still running.");
  expect(lastContext).toContain("Observed complete hand raises: 5");
  await expect(page.getByRole("button",{name:"Start tracking",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Close conversation",exact:true}).click();
  await expect(page.getByLabel("Hand raise count")).toHaveText("5 raises");
  await page.getByRole("button",{name:"Stop tracking",exact:true}).click();
  await page.getByRole("button",{name:"Open conversation",exact:true}).click();
  await expect(page.getByRole("log")).toContainText("5 complete hand raises");
  expect(paidObservations).toBe(0);
});
