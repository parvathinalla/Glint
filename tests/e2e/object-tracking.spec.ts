import { test,expect } from "./fixture";
test.use({reducedMotion:"reduce",viewport:{width:390,height:844}});

test("unsupported MP4 capture shows an error inside fullscreen without dispatching SAM",async({page,context})=>{
  await context.grantPermissions(["camera","microphone"]);
  await page.addInitScript(()=>{
    MediaRecorder.isTypeSupported=()=>false;
    localStorage.setItem("glint-ml-vad","0");
    localStorage.setItem("glint-streaming-voice","0");
  });
  let view:Record<string,unknown>,calls=0;
  await page.routeWebSocket("**/events",()=>{});
  await page.route("**/api/session",async route=>{
    view=await(await route.fetch()).json();view.key={connected:true,models:["muse-spark-test"]};
    await route.fulfill({json:view});
  });
  await page.route("**/api/phase",route=>route.fulfill({json:view}));
  await page.route("**/api/track",route=>{calls++;return route.fulfill({status:500});});
  await page.goto("/");
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  await page.getByText("Track object movement (SAM)",{exact:true}).click();
  await page.getByRole("button",{name:"Track 2-second movement",exact:true}).click();
  const error=page.locator(".object-tracking [role=alert]");
  await expect(error).toBeVisible();await expect(error).toContainText("MP4");
  expect(calls).toBe(0);
});

test("records only on request and displays bounded SAM motion in the camera view",async({page,context})=>{
  await context.grantPermissions(["camera","microphone"]);
  await page.addInitScript(()=>{
    localStorage.setItem("glint-ml-vad","0");
    localStorage.setItem("glint-streaming-voice","0");
    const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>{
      if(!constraints?.audio || constraints.video)return getMedia(constraints);
      const audio=new AudioContext(),output=audio.createMediaStreamDestination();
      return output.stream; // silent mic; no accidental turn while recording.
    };
  });
  let view:Record<string,unknown>,calls=0;
  await page.routeWebSocket("**/events",()=>{});
  await page.route("**/api/session",async route=>{
    view=await(await route.fetch()).json();view.key={connected:true,models:["muse-spark-test"]};
    await route.fulfill({json:view});
  });
  await page.route("**/api/phase",async route=>{
    view.epoch=Number(view.epoch)+1;
    await route.fulfill({json:view});
  });
  await page.route("**/api/observe",route=>route.fulfill({status:409,json:{message:"Observation paused in fixture"}}));
  await page.route("**/api/track",async route=>{
    calls++;
    const body=route.request().postDataJSON();
    const bytes=Buffer.from(body.clip.split(",")[1],"base64");
    expect(bytes.toString("ascii",4,8)).toBe("ftyp");
    expect(bytes.length).toBeLessThanOrEqual(600000);
    expect(body.to-body.from).toBeGreaterThanOrEqual(500);
    await route.fulfill({json:{concept:body.concept,direction:"right",reason:"Relative to camera view, in recorded clip.",
      boxes:[],reference:"camera-view",from:body.from,to:body.to,epoch:body.epoch}});
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  await expect(page.locator(".object-tracking")).toBeVisible();
  expect(calls).toBe(0);
  await page.getByText("Track object movement (SAM)",{exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Object to track"})).toHaveValue("computer mouse");
  const supported=await page.evaluate(()=>typeof MediaRecorder!=="undefined" && MediaRecorder.isTypeSupported("video/mp4"));
  await page.getByRole("button",{name:"Track 2-second movement",exact:true}).click();
  if(!supported){
    await expect(page.getByRole("alert")).toContainText("MP4");expect(calls).toBe(0);return;
  }
  await expect(page.locator(".object-tracking")).toContainText("Recorded computer mouse: right.",{timeout:15000});
  expect(calls).toBe(1);
  await page.screenshot({path:"test-results/object-tracking-phone.png"});
});
