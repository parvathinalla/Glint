import { test, expect, type Page } from "./fixture";
test.use({ reducedMotion: "reduce" });

test("ending a session cannot dispatch a voice turn waiting for pause",async({page,context})=>{
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await page.addInitScript(()=>{
    localStorage.setItem("glint-streaming-voice","0");
    localStorage.setItem("glint-ml-vad","0");
    localStorage.setItem("glint-neural-voice","0");
  });
  let session:Record<string,unknown>,answerCalls=0,voiceCalls=0,phaseStarted=false;
  let releasePhase!:()=>void,releaseAnswer!:()=>void;
  const phaseGate=new Promise<void>(resolve=>{releasePhase=resolve;});
  const answerGate=new Promise<void>(resolve=>{releaseAnswer=resolve;});
  await page.routeWebSocket("**/events",()=>{});
  await page.route("**/api/session",async route=>{session=await(await route.fetch()).json();session.key={connected:true,models:["muse-spark-test"]};await route.fulfill({json:session});});
  await page.route("**/api/agent/stream",async route=>{
    answerCalls++;await answerGate;
    await route.fulfill({json:{message:"Old response.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch}}).catch(()=>{});
  });
  await page.route("**/api/voice",route=>{voiceCalls++;return route.fulfill({json:{transcript:"New question.",epoch:route.request().postDataJSON().epoch}});});
  await page.route("**/api/phase",async route=>{phaseStarted=true;await phaseGate;await route.fulfill({json:session});});
  await page.route("**/api/vision/stop",route=>route.fulfill({json:session}));
  await startVoice(page, false);
  await page.getByRole("button",{name:"Open conversation"}).click();
  await page.getByRole("textbox",{name:"Message Glint"}).fill("Please help me get started.");
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect.poll(()=>answerCalls).toBe(1);
  await page.waitForTimeout(600);await say(page);
  await expect.poll(()=>phaseStarted).toBe(true);
  await page.getByRole("button",{name:"Close conversation"}).click();
  await page.getByRole("button",{name:"End session",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Session ended."})).toBeVisible();
  const phaseResponse=page.waitForResponse("**/api/phase");
  releasePhase();releaseAnswer();await phaseResponse;
  await page.waitForTimeout(400);
  expect(voiceCalls).toBe(0);expect(answerCalls).toBe(1);
  await expect(page.getByRole("heading",{name:"Session ended."})).toBeVisible();
});

test("voice diagnostics require opt-in and share no transcript content", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    localStorage.setItem("glint-ml-vad", "0");
    localStorage.setItem("glint-streaming-voice", "0");
    localStorage.setItem("glint-neural-voice", "0");
  });
  await connectedSession(page);
  const batches: unknown[] = [];
  await page.route("**/api/voice-diagnostics", async route => {
    batches.push(route.request().postDataJSON());
    await route.fulfill({ json: { accepted: route.request().postDataJSON().events.length } });
  });
  await page.route("**/api/voice", async route => {
    await route.fulfill({ json: { transcript: "Private fixture question.", epoch: route.request().postDataJSON().epoch } });
  });
  await page.route("**/api/agent/stream", async route => {
    await route.fulfill({ json: { message: "Fixture answer.", sources: [], searched: false, epoch: route.request().postDataJSON().epoch } });
  });
  await startVoice(page);
  await page.waitForTimeout(600);
  await say(page);
  await expect(page.getByText("Fixture answer.", { exact: true })).toBeVisible();
  expect(batches).toEqual([]);
  await page.getByRole("button", { name: "Close conversation" }).click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByText("Voice test diagnostics", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Record and share voice diagnostics" }).check();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.waitForTimeout(600);
  await say(page);
  await expect.poll(() => batches.length, { timeout: 10000 }).toBeGreaterThan(0);
  expect(JSON.stringify(batches)).toContain("reply-dispatched");
  expect(JSON.stringify(batches)).not.toContain("Private fixture question");
  expect(JSON.stringify(batches)).not.toContain("Fixture answer");
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByText("Shared with this test server.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download voice diagnostics" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Record and share voice diagnostics" }).uncheck();
});

test("old saved voiceprints no longer gate voice turns", async ({page, context}) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    localStorage.setItem("glint-ml-vad","0");
    localStorage.setItem("glint-streaming-voice","0");
    localStorage.setItem("glint-neural-voice","0");
    localStorage.setItem("glint-speaker-voiceprint",JSON.stringify({version:1,model:"wespeaker-resnet34-LM",dim:256,vector:Array(256).fill(0.1),samples:2}));
    (window as unknown as {__glintSpeaker:{embed:()=>never}}).__glintSpeaker={embed:()=>{throw Error("Speaker inference must not run");}};
  });
  await connectedSession(page);
  let voiceTurns = 0;
  await page.route("**/api/voice", route=>route.fulfill({json:{transcript:++voiceTurns === 1 ? "Hello Glint." : "What can you see on my desk?",epoch:route.request().postDataJSON().epoch}}));
  await page.route("**/api/agent/stream",route=>route.fulfill({json:{message:"Hello back.",sources:[],searched:false,epoch:route.request().postDataJSON().epoch}}));
  await startVoice(page, false); await page.waitForTimeout(600);
  const firstReply = page.waitForResponse("**/api/agent/stream");
  await say(page); await firstReply;
  await expect(page.getByRole("dialog",{name:"Conversation",exact:true})).not.toBeVisible();
  await page.getByRole("button",{name:"Open conversation"}).click();
  await expect(page.getByText("Hello back.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Close conversation"}).click();
  await context.grantPermissions(["camera","microphone"]);
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  const cameraReply = page.waitForResponse("**/api/agent/stream");
  await page.waitForTimeout(1600); await say(page); await cameraReply;
  await expect(page.getByRole("dialog",{name:"Conversation",exact:true})).not.toBeVisible();
});

/** 24 kHz mono 16-bit sine for mocked neural audio (0.5 amplitude). */
function pcm(seconds: number): string {
  const rate = 24000,
    count = Math.round(rate * seconds),
    bytes = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++)
    bytes.writeInt16LE(
      Math.round(
        Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5 * 32767,
      ),
      i * 2,
    );
  return bytes.toString("base64");
}
function sse(...events: unknown[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}
async function syntheticMicrophone(page: Page) {
  await page.addInitScript(() => {
    const actual = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const fixture = window as unknown as {
      voiceFixture: { say: (seconds?: number) => void; media: MediaStream };
    };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints?.audio || constraints.video) return actual(constraints);
      const context = new AudioContext(),
        output = context.createMediaStreamDestination(),
        gain = context.createGain(),
        oscillator = context.createOscillator();
      gain.gain.value = 0;
      oscillator.frequency.value = 220;
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start();
      await context.resume();
      fixture.voiceFixture = {
        media: output.stream,
        say: (seconds = 0.7) => {
          gain.gain.setValueAtTime(0.12, context.currentTime);
          gain.gain.setValueAtTime(0, context.currentTime + seconds);
        },
      };
      return output.stream;
    };
  });
}
/** Neural tests opt out of the companion-suite robot pin. */
async function neuralClient(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("glint-neural-voice");
    // Deterministic turn bounds: ML tone hallucinations and the streaming
    // lane would make barge timing nondeterministic (suite convention).
    localStorage.setItem("glint-ml-vad", "0");
    localStorage.setItem("glint-streaming-voice", "0");
    const fixture = window as unknown as {
      heard: Array<{ seq: number; text: string }>;
      spoken: string[];
    };
    fixture.heard = [];
    fixture.spoken = [];
    window.addEventListener("glint-voice-audio", (event) =>
      fixture.heard.push((event as CustomEvent).detail),
    );
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: (utterance: SpeechSynthesisUtterance) => {
          if (utterance.text.trim()) fixture.spoken.push(utterance.text);
        },
        cancel: () => {},
      },
    });
  });
}
async function connectedSession(page: Page) {
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch(),
      view = await response.json();
    view.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: view });
  });
}
async function say(page: Page) {
  await page.evaluate(
    () =>
      (window as unknown as { voiceFixture: { say: () => void } }).voiceFixture.say(),
  );
}
async function startVoice(page: Page, showConversation = true) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
  if (showConversation) await page.getByRole("button", {name:"Open conversation"}).click();
}

test("opening the camera unlocks playback before requesting camera permission", async ({ page, context }) => {
  await context.grantPermissions(["camera", "microphone"]);
  await neuralClient(page);
  await page.addInitScript(() => {
    const state = window as unknown as { audioUnlocked: boolean; cameraSawUnlock: boolean };
    state.audioUnlocked = false;
    const ActualContext = window.AudioContext;
    window.AudioContext = class extends ActualContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        state.audioUnlocked = navigator.userActivation.isActive;
      }
    };
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      state.audioUnlocked = true;
      return resume.call(this);
    };
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => {
      if (constraints?.video) state.cameraSawUnlock = state.audioUnlocked;
      return getMedia(constraints);
    };
  });
  await page.routeWebSocket("**/events", () => {});
  await page.goto("/");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { cameraSawUnlock: boolean }).cameraSawUnlock)).toBe(true);
});

test("neural voice speaks streamed sentences without device speech", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await neuralClient(page);
  await connectedSession(page);
  let voice: unknown;
  await page.route("**/api/voice", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: { transcript: "What shape is my face?", epoch: body.epoch },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const body = route.request().postDataJSON();
    voice = body.voice;
    await route.fulfill({
      contentType: "text/event-stream",
      body: sse(
        { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
        { type: "delta", text: "Your face looks " },
        { type: "delta", text: "round to oval. " },
        {
          type: "audio",
          seq: 0,
          text: "Your face looks round to oval.",
          pcm: pcm(0.3),
          sampleRate: 24000,
        },
        { type: "delta", text: "Fuller cheeks. " },
        {
          type: "audio",
          seq: 1,
          text: "Fuller cheeks.",
          pcm: pcm(0.3),
          sampleRate: 24000,
        },
        {
          type: "done",
          reply: {
            message: "Your face looks round to oval. Fuller cheeks.",
            sources: [],
            searched: false,
            epoch: body.epoch,
          },
        },
        { type: "voice-done" },
      ),
    });
  });
  await startVoice(page);
  await page.waitForTimeout(600);
  await say(page);
  await expect(
    page.getByText("Your face looks round to oval. Fuller cheeks.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { heard: unknown[] }).heard.length,
      ),
    )
    .toBe(2);
  const heard = await page.evaluate(
    () => (window as unknown as { heard: Array<{ seq: number; text: string }> }).heard,
  );
  expect(heard).toEqual([
    { seq: 0, text: "Your face looks round to oval." },
    { seq: 1, text: "Fuller cheeks." },
  ]);
  expect(
    await page.evaluate(
      () => (window as unknown as { spoken: string[] }).spoken,
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => document.body.dataset.voiceMode)).toBe(
    "neural",
  );
  expect(voice).toBe("neural");
  await expect(page.getByText("Neural voice · sentence 2")).toBeVisible();
});

test("neural audio plays a completed reply without text deltas or duplicate device speech", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await neuralClient(page);
  await connectedSession(page);
  await page.route("**/api/voice", async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { transcript: "Please help me.", epoch: body.epoch } });
  });
  await page.route("**/api/agent/stream", async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ contentType: "text/event-stream", body: sse(
      { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
      { type: "done", reply: { message: "Ready to help.", sources: [], searched: false, epoch: body.epoch } },
      { type: "audio", seq: 0, text: "Ready to help.", pcm: pcm(0.3), sampleRate: 24000 },
      { type: "voice-done" },
    ) });
  });
  await startVoice(page);
  await page.waitForTimeout(600);
  await say(page);
  await expect(page.getByText("Ready to help.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { heard: unknown[] }).heard.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toEqual([]);
});

test("a dropped microphone burst does not abort audio still being generated", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await neuralClient(page);
  await connectedSession(page);
  await page.route("**/api/voice", async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { transcript: "Please help me.", epoch: body.epoch } });
  });
  let requests = 0;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/agent/stream", async route => {
    requests++;
    const body = route.request().postDataJSON();
    await ready;
    await route.fulfill({ contentType: "text/event-stream", body: sse(
      { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
      { type: "delta", text: "The audio survived. " },
      { type: "done", reply: { message: "The audio survived.", sources: [], searched: false, epoch: body.epoch } },
      { type: "audio", seq: 0, text: "The audio survived.", pcm: pcm(0.3), sampleRate: 24000 },
      { type: "voice-done" },
    ) });
  });
  await startVoice(page);
  await page.waitForTimeout(600);
  await say(page);
  await expect.poll(() => requests).toBe(1);
  // Long enough to trigger the onset detector, too short to submit speech.
  await page.evaluate(() => (window as unknown as { voiceFixture: { say: (seconds: number) => void } }).voiceFixture.say(0.18));
  await page.waitForTimeout(1400);
  release();
  await expect.poll(() => page.evaluate(() => (window as unknown as { heard: Array<{ text: string }> }).heard.map(x => x.text))).toContain("The audio survived.");
  expect(requests).toBe(1);
});

test("the kill switch keeps device speech and asks for no voice", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    localStorage.setItem("glint-neural-voice", "0");
    localStorage.setItem("glint-ml-vad", "0");
    localStorage.setItem("glint-streaming-voice", "0");
    const fixture = window as unknown as { spoken: string[] };
    fixture.spoken = [];
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: (utterance: SpeechSynthesisUtterance) => {
          if (utterance.text.trim()) fixture.spoken.push(utterance.text);
        },
        cancel: () => {},
      },
    });
  });
  await connectedSession(page);
  let voice: unknown;
  await page.route("**/api/voice", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: { transcript: "Hello there.", epoch: body.epoch },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const body = route.request().postDataJSON();
    voice = body.voice;
    await route.fulfill({
      json: {
        message: "Hi! I can see you.",
        sources: [],
        searched: false,
        epoch: body.epoch,
      },
    });
  });
  await startVoice(page);
  await page.waitForTimeout(600);
  await say(page);
  await expect(
    page.getByText("Hi! I can see you.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken.length,
      ),
    )
    .toBeGreaterThan(0);
  expect(voice).toBe("off");
  expect(await page.evaluate(() => document.body.dataset.voiceMode)).toBe(
    undefined,
  );
});

test("barge-in cancels queued neural audio and answers the new turn", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await neuralClient(page);
  await connectedSession(page);
  // Barge confirmation pauses through the real server, which would drop
  // the mocked connected key and end voice: re-attach it per pause.
  await page.route("**/api/phase", async (route) => {
    const value = await (await route.fetch()).json();
    value.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: value });
  });
  await page.route("**/api/voice", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: { transcript: "Keep talking.", epoch: body.epoch },
    });
  });
  let calls = 0;
  await page.route("**/api/agent/stream", async (route) => {
    const body = route.request().postDataJSON();
    calls++;
    if (calls === 1)
      await route.fulfill({
        contentType: "text/event-stream",
        body: sse(
          { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
          { type: "delta", text: "First sentence here. " },
          {
            type: "audio",
            seq: 0,
            text: "First sentence here.",
            pcm: pcm(3),
            sampleRate: 24000,
          },
          { type: "delta", text: "Second sentence here. " },
          {
            type: "audio",
            seq: 1,
            text: "Second sentence here.",
            pcm: pcm(0.3),
            sampleRate: 24000,
          },
          {
            type: "done",
            reply: {
              message: "First sentence here. Second sentence here.",
              sources: [],
              searched: false,
              epoch: body.epoch,
            },
          },
          { type: "voice-done" },
        ),
      });
    else
      await route.fulfill({
        contentType: "text/event-stream",
        body: sse(
          { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
          { type: "delta", text: "New answer. " },
          {
            type: "audio",
            seq: 0,
            text: "New answer.",
            pcm: pcm(0.3),
            sampleRate: 24000,
          },
          {
            type: "done",
            reply: {
              message: "New answer.",
              sources: [],
              searched: false,
              epoch: body.epoch,
            },
          },
          { type: "voice-done" },
        ),
      });
  });
  await startVoice(page);
  await page.waitForTimeout(600);
  await say(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { heard: unknown[] }).heard.length,
      ),
    )
    .toBeGreaterThanOrEqual(1);
  // Barge mid-sentence (past the 500 ms echo-guard window): the queued
  // second sentence must never play.
  await page.waitForTimeout(600);
  await say(page);
  await expect(
    page.getByText("New answer.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { heard: Array<{ text: string }> }).heard.map(
              (item) => item.text,
            ),
        ),
      { timeout: 15000 },
    )
    .toContain("New answer.");
  const heard = await page.evaluate(
    () => (window as unknown as { heard: Array<{ text: string }> }).heard,
  );
  expect(heard.map((item) => item.text)).not.toContain(
    "Second sentence here.",
  );
  expect(calls).toBe(2);
});
