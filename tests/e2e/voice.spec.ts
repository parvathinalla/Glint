import { test, expect, type Page } from "./fixture";
test.use({ reducedMotion: "reduce" });

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
      voiceFixture: { say: () => void; media: MediaStream };
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
        say: () => {
          gain.gain.setValueAtTime(0.12, context.currentTime);
          gain.gain.setValueAtTime(0, context.currentTime + 0.7);
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
async function startVoice(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
}

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
            pcm: pcm(2),
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
