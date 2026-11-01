import { openConversation, closeConversation, openSettings, setSpokenReplies, typeMessage, openInstructions, openCameraFullscreen } from "./ui-helpers";
import { test, expect, type Page } from "./fixture";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
test.use({ reducedMotion: "reduce" });

async function syntheticMicrophone(page: Page) {
  await page.addInitScript(() => {
    // Companion specs pin device speech; neural coverage lives in voice.spec.ts.
    localStorage.setItem("glint-neural-voice", "0");
    const actual = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const fixture = window as unknown as {
      voiceFixture: {
        say: () => void;
        blip: (ms: number) => void;
        playSpeech: (
          b64: string,
          gainValue: number,
          seconds: number,
        ) => Promise<void>;
        media: MediaStream;
      };
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
      // Live source nodes must stay referenced while playing: an
      // unreferenced BufferSource can be garbage-collected mid-burst and
      // render silence. Released onended.
      const live: AudioNode[] = [];
      const retain = (source: AudioBufferSourceNode, gain: GainNode) => {
        live.push(source, gain);
        source.onended = () => {
          const at = live.indexOf(source);
          if (at >= 0) live.splice(at, 2);
        };
      };
      fixture.voiceFixture = {
        media: output.stream,
        say: () => {
          gain.gain.setValueAtTime(0.12, context.currentTime);
          gain.gain.setValueAtTime(0, context.currentTime + 0.7);
        },
        // Short burst: long enough to start a detector turn (160 ms) but
        // too short to produce turn audio (200 ms voiced), so the turn is
        // dropped without transcription. A tone, not noise: browser noise
        // suppression would eat a white-noise burst before detection.
        blip: (ms: number) => {
          gain.gain.setValueAtTime(0.12, context.currentTime);
          gain.gain.setValueAtTime(0, context.currentTime + ms / 1000);
        },
        // Real-speech clip through its own gain stage (base64 WAV bytes).
        playSpeech: async (b64: string, gainValue: number, seconds: number) => {
          const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const decoded = await context.decodeAudioData(raw.buffer);
          const source = context.createBufferSource();
          source.buffer = decoded;
          const speechGain = context.createGain();
          speechGain.gain.value = gainValue;
          source.connect(speechGain);
          speechGain.connect(output);
          retain(source, speechGain);
          source.start(0, 0, seconds);
        },
      };
      return output.stream;
    };
  });
}

test("response failure preserves the message and offers an explicit retry beside the composer", async ({
  page,
}) => {
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch(),
      view = await response.json();
    view.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: view });
  });
  let calls = 0;
  await page.route("**/api/agent/stream", async (route) => {
    calls++;
    const request = route.request().postDataJSON();
    if (calls === 1)
      await route.fulfill({
        status: 502,
        json: {
          message:
            "Muse reached its response limit before finishing. Your message is saved below; you can retry it.",
        },
      });
    else
      await route.fulfill({
        json: {
          message: "Let’s begin by checking which ingredients you have.",
          sources: [],
          searched: false,
          epoch: request.epoch,
        },
      });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Talk to Glint", exact: true })).toBeVisible();
  await setSpokenReplies(page, false);
  await typeMessage(page, "I want to learn to cook fish curry.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Message Glint")).toHaveValue(
    "I want to learn to cook fish curry.",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Let’s begin by checking which ingredients you have.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await expect(
    page.getByText("I want to learn to cook fish curry.", { exact: true }),
  ).toHaveCount(1);
});

test("camera is available immediately without task setup or a model key", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera"]);
  await page.goto("/");
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await typeMessage(page, "Draft camera check");
  await openCameraFullscreen(page);
  await expect(page.getByRole("dialog", { name: "Meta Model API" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Stop camera", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".companion-camera.is-fullscreen")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".companion-camera video")
        .evaluate((video: HTMLVideoElement) => video.videoWidth),
    )
    .toBeGreaterThan(0);
  mkdirSync("visual-proof", {recursive:true});
  const scratch = resolve("visual-proof", `camera-watch-${randomUUID()}.html`);
  try {
    writeFileSync(
      scratch,
      "<!doctype html><title>Watcher regression fixture</title>",
    );
    await page.waitForTimeout(6500);
    expect(navigations).toBe(0);
    await expect(page.getByLabel("Message Glint")).toHaveValue(
      "Draft camera check",
    );
    await expect(
      page.getByRole("button", { name: "Stop camera", exact: true }),
    ).toBeVisible();
  } finally {
    unlinkSync(scratch);
  }
  await page.screenshot({
    path: "test-results/glint-companion-camera.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Exit full screen camera", exact: true })
    .click();
  await expect(page.locator(".companion-camera.is-fullscreen")).toHaveCount(0);
  await closeConversation(page);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  expect(
    await page
      .locator(".companion-camera video")
      .evaluate((video: HTMLVideoElement) => video.srcObject),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Meta Model API" }),
  ).toBeVisible();
});

test("hands-free voice turns and optional link flow (mock provider, synthetic microphone)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await page.addInitScript(() => localStorage.setItem("glint-streaming-voice", "0"));
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    value.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: value });
  });
  let voiceRequests = 0,
    agentRequests = 0;
  await page.route("**/api/voice", async (route) => {
    const body = route.request().postDataJSON();
    const audio = Buffer.from(body.audio, "base64");
    expect(audio.subarray(0, 4).toString()).toBe("RIFF");
    expect(audio.readUInt32LE(24)).toBe(24000);
    expect(audio.length).toBeLessThanOrEqual(720044);
    voiceRequests++;
    await route.fulfill({
      json: { transcript: "Help me build this organizer.", epoch: body.epoch },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const body = route.request().postDataJSON();
    agentRequests++;
    expect(body.model).toBe("muse-spark-test");
    await route.fulfill({
      json: {
        message: body.url
          ? "I found instructions for this organizer. Let’s identify the parts first."
          : "Of course. Do you have a product or manual link?",
        sources: body.url
          ? [{ title: "Example source fixture", url: "https://www.ikea.com/" }]
          : [],
        searched: !!body.url,
        epoch: body.epoch,
      },
    });
  });
  await page.goto("/");
  await setSpokenReplies(page, false);
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
  await openConversation(page);
  await page.waitForTimeout(600);
  expect(voiceRequests).toBe(0);
  await page.evaluate(() =>
    (
      window as unknown as { voiceFixture: { say: () => void } }
    ).voiceFixture.say(),
  );
  await expect(
    page.getByText("Help me build this organizer.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Of course. Do you have a product or manual link?", {
      exact: true,
    }),
  ).toBeVisible();
  expect(voiceRequests).toBe(1);
  await expect(
    page.getByText(
      "Sent as a voice recording (live transcription unavailable).",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page.waitForTimeout(600);
  await page.evaluate(() =>
    (
      window as unknown as { voiceFixture: { say: () => void } }
    ).voiceFixture.say(),
  );
  await expect.poll(() => voiceRequests).toBe(2);
  await expect.poll(() => agentRequests).toBe(2);
  await openInstructions(page);
  await page.getByLabel("Product or manual link").fill("https://www.ikea.com/");
  await page.getByRole("button", { name: "Let Glint read it" }).click();
  await expect(page.getByRole("dialog", {name:"Add instructions link"})).not.toBeVisible();
  await openConversation(page);
  await expect(
    page.getByRole("link", { name: "Example source fixture" }),
  ).toBeVisible();
  expect(agentRequests).toBe(3);
  await page
    .getByRole("button", { name: "End voice chat", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { voiceFixture: { media: MediaStream } }
      ).voiceFixture.media
        .getTracks()
        .every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/glint-companion-conversation-fixture.png",
    fullPage: true,
  });
});

for (const losesAudio of [false, true, "early"] as const) {
test(`streaming voice ${losesAudio==="early" ? "uses the complete recording after an early final" : losesAudio ? "uses the complete recording after an audio gap" : "shows partials and sends without a file upload"} (mock socket)`, async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/api/session", async (route) => {
    const value = await (await route.fetch()).json();
    value.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: value });
  });
  let voiceRequests = 0,
    agentRequests = 0;
  await page.route("**/api/voice", async (route) => {
    voiceRequests++;
    if (losesAudio) {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { transcript: "Help me build this organizer.", epoch: body.epoch } });
    } else await route.fulfill({ status: 500, json: { message: "must not happen" } });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const body = route.request().postDataJSON();
    agentRequests++;
    await route.fulfill({
      json: {
        message: "Of course. Do you have a product or manual link?",
        sources: [],
        searched: false,
        epoch: body.epoch,
      },
    });
  });
  await page.routeWebSocket("**/voice-stream", (ws) => {
    let partialSent = false;
    ws.onMessage((message) => {
      if (typeof message !== "string") {
        if (!partialSent) {
          partialSent = true;
          if (losesAudio) {
            if(losesAudio===true)ws.send(JSON.stringify({ type: "gap" }));
            // A delayed, incomplete result must not create a second answer.
            ws.send(JSON.stringify({ type: "final", transcript: "organizer" }));
          } else ws.send(JSON.stringify({ type: "partial", text: "Help me" }));
        }
        return;
      }
      const frame = JSON.parse(message) as { type: string };
      if (frame.type === "open") ws.send(JSON.stringify({ type: "opened" }));
      if (frame.type === "end") {
        ws.send(
          JSON.stringify({
            type: "final",
            transcript: "Help me build this organizer.",
          }),
        );
        ws.send(JSON.stringify({ type: "closed", code: 1000, retryable: false }));
      }
    });
  });
  await page.goto("/");
  await setSpokenReplies(page, false);
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
  await openConversation(page);
  await page.evaluate(() =>
    (
      window as unknown as { voiceFixture: { say: () => void } }
    ).voiceFixture.say(),
  );
  if (!losesAudio) await expect(page.getByText("Help me", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Help me build this organizer.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Of course. Do you have a product or manual link?", {
      exact: true,
    }),
  ).toBeVisible();
  expect(voiceRequests).toBe(losesAudio ? 1 : 0);
  expect(agentRequests).toBe(1);
  await expect(
    page.getByText("Sent as a voice recording (live transcription unavailable).", {
      exact: true,
    }),
  ).toHaveCount(losesAudio ? 1 : 0);
});
}

test("voice can interrupt read-aloud and continue with a new automatic turn", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    const fixture = window as unknown as { spoken: string[]; canceled: number };
    fixture.spoken = [];
    fixture.canceled = 0;
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        // Audible replies only: the silent unlock utterance is not speech.
        speak: (utterance: SpeechSynthesisUtterance) => {
          if (utterance.text.trim()) fixture.spoken.push(utterance.text);
        },
        cancel: () => {
          fixture.canceled++;
        },
      },
    });
  });
  await page.routeWebSocket("**/events", () => {});
  let state: Record<string, unknown>,
    epoch = 0,
    turns = 0;
  await page.route("**/api/session", async (route) => {
    state = await (await route.fetch()).json();
    state.key = { connected: true, models: ["muse-spark-test"] };
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/phase", async (route) => {
    epoch++;
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/voice", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: { transcript: "Here is my next question.", epoch: request.epoch },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const request = route.request().postDataJSON();
    turns++;
    expect(request.epoch).toBe(epoch);
    const text =
      turns === 1
        ? "I can help with that. "
        : "Let’s answer your next question. ";
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  await openConversation(page);
  await page.evaluate(() =>
    (
      window as unknown as { voiceFixture: { say: () => void } }
    ).voiceFixture.say(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken.length,
      ),
    )
    .toBe(1);
  await page.waitForTimeout(600);
  const before = await page.evaluate(
    () => (window as unknown as { canceled: number }).canceled,
  );
  await page.evaluate(() =>
    (
      window as unknown as { voiceFixture: { say: () => void } }
    ).voiceFixture.say(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { canceled: number }).canceled),
    )
    .toBeGreaterThan(before);
  await expect.poll(() => turns).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken.length,
      ),
    )
    .toBe(2);
  await page.getByRole("button", { name: "End voice chat" }).click();
  await expect(
    page.getByRole("button", { name: "Talk to Glint", exact: true }),
  ).toBeVisible();
});

test("a short noise burst leaves read-aloud uninterrupted", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    localStorage.setItem("glint-streaming-voice", "0");
    const fixture = window as unknown as { spoken: string[]; canceled: number; finish?: () => void };
    fixture.spoken = [];
    fixture.canceled = 0;
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: (utterance: SpeechSynthesisUtterance) => {
          if (utterance.text.trim()) fixture.spoken.push(utterance.text);
          fixture.finish = () => utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
        },
        cancel: () => {
          fixture.canceled++;
        },
      },
    });
  });
  await page.routeWebSocket("**/events", () => {});
  let state: Record<string, unknown>,
    epoch = 0,
    turns = 0,
    voiceCalls = 0;
  await page.route("**/api/session", async (route) => {
    state = await (await route.fetch()).json();
    state.key = { connected: true, models: ["muse-spark-test"] };
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/phase", async (route) => {
    epoch++;
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/voice", async (route) => {
    voiceCalls++;
    const request = route.request().postDataJSON();
    // Meta-like: the full first turn transcribes; a short blip that slips
    // through as a sent turn yields no speech.
    await route.fulfill({
      json: {
        transcript: voiceCalls === 1 ? "Tell me about braids." : "",
        epoch: request.epoch,
      },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const request = route.request().postDataJSON();
    turns++;
    expect(request.epoch).toBe(epoch);
    const text =
      turns === 1
        ? "First sentence here. Second sentence here. "
        : "Unexpected second turn. ";
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  await openConversation(page);
  await page.evaluate(
    () =>
      (window as unknown as { voiceFixture: { say: () => void } })
        .voiceFixture.say(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken.length,
      ),
    )
    .toBe(1);
  // Past the 500 ms barge-guard grace so the burst counts as an interrupt.
  await page.waitForTimeout(600);
  const canceledBefore = await page.evaluate(
    () => (window as unknown as { canceled: number }).canceled,
  );
  await page.evaluate(
    () =>
      (
        window as unknown as {
          voiceFixture: { blip: (ms: number) => void };
        }
      ).voiceFixture.blip(180),
  );
  // A brief burst must not stop playback or manufacture a second turn.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as {canceled:number}).canceled)).toBe(canceledBefore);
  await page.evaluate(() => (window as unknown as {finish?:()=>void}).finish?.());
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken,
      ),
    )
    .toEqual(["First sentence here.", "Second sentence here."]);
  // Either the burst dropped (no transcription) or it was sent and
  // transcribed empty like Meta would: no agent turn either way.
  await page.waitForTimeout(1500);
  expect(turns).toBe(1);
  expect(voiceCalls).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "End voice chat" }).click();
});

test("a sent pop that transcribes empty resumes read-aloud", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    localStorage.setItem("glint-streaming-voice", "0");
    const fixture = window as unknown as { spoken: string[]; canceled: number };
    fixture.spoken = [];
    fixture.canceled = 0;
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: (utterance: SpeechSynthesisUtterance) => {
          if (utterance.text.trim()) fixture.spoken.push(utterance.text);
        },
        cancel: () => {
          fixture.canceled++;
        },
      },
    });
  });
  await page.routeWebSocket("**/events", () => {});
  let state: Record<string, unknown>,
    epoch = 0,
    turns = 0,
    voiceCalls = 0;
  await page.route("**/api/session", async (route) => {
    state = await (await route.fetch()).json();
    state.key = { connected: true, models: ["muse-spark-test"] };
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/phase", async (route) => {
    epoch++;
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/voice", async (route) => {
    voiceCalls++;
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: {
        transcript: voiceCalls === 1 ? "Tell me about braids." : "",
        epoch: request.epoch,
      },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const request = route.request().postDataJSON();
    turns++;
    expect(request.epoch).toBe(epoch);
    const text =
      turns === 1
        ? "First sentence here. Second sentence here. "
        : "Unexpected second turn. ";
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  await openConversation(page);
  await page.evaluate(
    () =>
      (window as unknown as { voiceFixture: { say: () => void } })
        .voiceFixture.say(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken.length,
      ),
      {timeout:10000},
    )
    .toBe(1);
  await page.waitForTimeout(600);
  const canceledBefore = await page.evaluate(
    () => (window as unknown as { canceled: number }).canceled,
  );
  // 400 ms always produces turn audio, unlike the knife-edge 180 ms blip.
  await page.evaluate(
    () =>
      (
        window as unknown as {
          voiceFixture: { blip: (ms: number) => void };
        }
      ).voiceFixture.blip(400),
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { canceled: number }).canceled),
    )
    .toBeGreaterThan(canceledBefore);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken,
      ),
    )
    .toEqual(["First sentence here.", "Second sentence here."]);
  await page.waitForTimeout(1500);
  expect(turns).toBe(1);
  expect(voiceCalls).toBe(2);
  await page.getByRole("button", { name: "End voice chat" }).click();
});

test("neural VAD hears quiet speech that energy misses (and only it does)", async ({
  page,
}) => {
  const clip = readFileSync(
    resolve("tests/fixtures/speech-jfk.wav"),
  ).toString("base64");
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
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
  await page.routeWebSocket("**/events", () => {});
  let state: Record<string, unknown>,
    epoch = 0,
    turns = 0,
    voiceCalls = 0;
  await page.route("**/api/session", async (route) => {
    state = await (await route.fetch()).json();
    state.key = { connected: true, models: ["muse-spark-test"] };
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/phase", async (route) => {
    epoch++;
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/voice", async (route) => {
    voiceCalls++;
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: { transcript: "Quiet test phrase.", epoch: request.epoch },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const request = route.request().postDataJSON();
    turns++;
    expect(request.epoch).toBe(epoch);
    const text = "Heard you quietly. ";
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch } })}\n\n`,
    });
  });
  const play = () =>
    page.evaluate(
      ([b64]) =>
        (
          window as unknown as {
            voiceFixture: {
              playSpeech: (
                data: string,
                gainValue: number,
                seconds: number,
              ) => Promise<void>;
            };
          }
        ).voiceFixture.playSpeech(b64, 0.025, 5),
      [clip],
    );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  await openConversation(page);
  // Let the model load: 2.3 MB weights plus WASM compile, locally served.
  await page.waitForTimeout(3000);
  await play();
  // Neural detection starts the turn even though energy stays sub-threshold.
  await expect(page.getByText("Heard you quietly.", { exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  expect(voiceCalls).toBe(1);
  expect(turns).toBe(1);
  await expect(page.getByText(/Neural voice detection/)).toHaveCount(0);
  // Phase 2: the same clip with neural VAD disabled must detect nothing.
  await page.getByRole("button", { name: "End voice chat" }).click();
  await page.evaluate(() => localStorage.setItem("glint-ml-vad", "0"));
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  await openConversation(page);
  await play();
  await page.waitForTimeout(7500);
  expect(voiceCalls).toBe(1);
  expect(turns).toBe(1);
  await page.getByRole("button", { name: "End voice chat" }).click();
});

test("voice still works on energy when the neural model is missing", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    localStorage.setItem("glint-streaming-voice", "0");
  });
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/vad/**", (route) => route.abort());
  let state: Record<string, unknown>,
    epoch = 0,
    turns = 0;
  await page.route("**/api/session", async (route) => {
    state = await (await route.fetch()).json();
    state.key = { connected: true, models: ["muse-spark-test"] };
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/phase", async (route) => {
    epoch++;
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/voice", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: { transcript: "Loud and clear.", epoch: request.epoch },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const request = route.request().postDataJSON();
    turns++;
    expect(request.epoch).toBe(epoch);
    const text = "Fallback reply. ";
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  await openConversation(page);
  await page.evaluate(
    () =>
      (window as unknown as { voiceFixture: { say: () => void } })
        .voiceFixture.say(),
  );
  await expect(page.getByText("Fallback reply.", { exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  expect(turns).toBe(1);
  await openSettings(page);
  await page.getByText("Voice test diagnostics", { exact: true }).click();
  await expect(page.getByText(/Neural voice detection unavailable/)).toBeVisible();
  await page.getByRole("button", { name:"Close settings" }).click();
  await openConversation(page);
  await page.getByRole("button", { name: "End voice chat" }).click();
});

test("speaker echo is transcribed but never answered (loop breaker)", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
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
  await page.routeWebSocket("**/events", () => {});
  let state: Record<string, unknown>,
    epoch = 0,
    agentRequests = 0,
    voiceRequests = 0;
  await page.route("**/api/session", async (route) => {
    state = await (await route.fetch()).json();
    state.key = { connected: true, models: ["muse-spark-test"] };
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/phase", async (route) => {
    epoch++;
    state.epoch = epoch;
    await route.fulfill({ json: state });
  });
  await page.route("**/api/voice", async (route) => {
    const request = route.request().postDataJSON();
    voiceRequests++;
    await route.fulfill({
      json: {
        transcript:
          voiceRequests === 1
            ? "Help me build this organizer."
            : "I can help with that",
        epoch: request.epoch,
      },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const body = route.request().postDataJSON();
    agentRequests++;
    await route.fulfill({
      json: {
        message: "I can help with that. ",
        sources: [],
        searched: false,
        epoch: body.epoch,
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
  await openConversation(page);
  await page.evaluate(() =>
    (
      window as unknown as { voiceFixture: { say: () => void } }
    ).voiceFixture.say(),
  );
  await expect(
    page.getByText("Help me build this organizer.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { spoken: string[] }).spoken.length,
        ),
      { timeout: 10000 },
    )
    .toBe(1);
  await page.waitForTimeout(600);
  await page.evaluate(() =>
    (
      window as unknown as { voiceFixture: { say: () => void } }
    ).voiceFixture.say(),
  );
  // The echo turn completes transcription and is then dropped silently.
  await page.waitForTimeout(3500);
  expect(voiceRequests).toBe(2);
  expect(agentRequests).toBe(1);
  await expect(page.locator(".companion-message.from-you")).toHaveCount(1);
});

test("muting a streamed reply prevents later sentences from being spoken", async ({
  page,
}) => {
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/api/session", async (route) => {
    const view = await (await route.fetch()).json();
    view.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: view });
  });
  await page.addInitScript(() => {
    const fixture = window as unknown as {
      spoken: string[];
      streamFixture: { delta: (text: string) => void; finish: () => void };
    };
    fixture.spoken = [];
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: (utterance: SpeechSynthesisUtterance) => { if (utterance.text.trim()) fixture.spoken.push(utterance.text); },
        cancel: () => {},
      },
    });
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input !== "/api/agent/stream") return original(input, init);
      const body = JSON.parse(String(init?.body)),
        encoder = new TextEncoder();
      let text = "";
      const stream = new ReadableStream({
        start(controller) {
          const emit = (value: unknown) =>
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
            );
          fixture.streamFixture = {
            delta: (chunk) => {
              text += chunk;
              emit({ type: "delta", text: chunk });
            },
            finish: () => {
              emit({
                type: "done",
                reply: {
                  message: text,
                  sources: [],
                  searched: false,
                  epoch: body.epoch,
                },
              });
              controller.close();
            },
          };
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    };
  });
  await page.goto("/");
  await typeMessage(page, "Help me get started.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { streamFixture: { delta: (text: string) => void } }
    ).streamFixture.delta("First sentence. "),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken.length,
      ),
    )
    .toBe(1);
  await setSpokenReplies(page, false);
  await page.evaluate(() =>
    (
      window as unknown as {
        streamFixture: { delta: (text: string) => void; finish: () => void };
      }
    ).streamFixture.delta("This later sentence must stay muted. "),
  );
  await page.evaluate(() =>
    (
      window as unknown as { streamFixture: { finish: () => void } }
    ).streamFixture.finish(),
  );
  await expect(
    page.getByText("First sentence. This later sentence must stay muted.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { spoken: string[] }).spoken.length,
    ),
  ).toBe(1);
});
