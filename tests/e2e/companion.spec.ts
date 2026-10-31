import { test, expect, type Page } from "./fixture";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
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
  await expect(
    page
      .locator(".message-composer")
      .getByRole("button", { name: "Talk to Glint" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".companion-controls")
      .getByRole("button", { name: "Talk to Glint" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
  await page
    .getByLabel("Message Glint")
    .fill("I want to learn to cook fish curry.");
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
  await page.getByLabel("Message Glint").fill("Draft camera check");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Meta Model API" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
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

test("fullscreen camera subtitles spoken replies with a CC toggle", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera", "microphone"]);
  await syntheticMicrophone(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: { paused: false, speak: () => {}, cancel: () => {} },
    });
  });
  let state: Record<string, unknown>;
  await page.route("**/api/session", async (route) => {
    state = await (await route.fetch()).json();
    state.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: state });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const body = route.request().postDataJSON();
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
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.locator(".companion-camera.is-fullscreen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ask about this view", exact: true })
    .click();
  const subtitles = page.locator(".companion-subtitles");
  await expect(subtitles).toHaveText("I can help with that.");
  await page
    .getByRole("button", { name: "Turn subtitles off", exact: true })
    .click();
  await expect(subtitles).toHaveCount(0);
  await page
    .getByRole("button", { name: "Turn subtitles on", exact: true })
    .click();
  await expect(subtitles).toHaveText("I can help with that.");
  await page
    .getByRole("button", { name: "Exit full screen camera", exact: true })
    .click();
  await expect(page.locator(".companion-camera.is-fullscreen")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Stop camera", exact: true }),
  ).toBeVisible();
});

test("hands-free voice turns and optional link flow (mock provider, synthetic microphone)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await syntheticMicrophone(page);
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
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Add instructions link" }).click();
  await page.getByLabel("Product or manual link").fill("https://www.ikea.com/");
  await page.getByRole("button", { name: "Let Glint read it" }).click();
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

for (const losesAudio of [false, true]) {
test(`streaming voice ${losesAudio ? "uses the complete recording after an audio gap" : "shows partials and sends without a file upload"} (mock socket)`, async ({
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
            ws.send(JSON.stringify({ type: "gap" }));
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
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat", exact: true }),
  ).toBeVisible();
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

test("a short noise burst pauses read-aloud and speech resumes after the drop", async ({
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
  // The burst interrupts (soft-stop) and the dropped turn resumes speech.
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
  await page.evaluate(
    () =>
      (window as unknown as { voiceFixture: { say: () => void } })
        .voiceFixture.say(),
  );
  await expect(page.getByText("Fallback reply.", { exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  expect(turns).toBe(1);
  await expect(
    page.getByText(/Neural voice detection unavailable/),
  ).toBeVisible();
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
        speak: (utterance: SpeechSynthesisUtterance) =>
          fixture.spoken.push(utterance.text),
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
  await page.getByLabel("Message Glint").fill("Help me get started.");
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
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
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

async function syntheticSpeaker(
  page: Page,
  plan: string[],
  seed = true,
) {
  // Plan entries per embedding call: "owner", "stranger", or
  // "stranger:<ms>" / "owner:<ms>" for a delayed verdict. The neural net
  // is mocked but the real cosine + threshold policy scores it.
  await page.addInitScript((options: { plan: string[]; seed: boolean }) => {
    const dim = 256,
      owner = new Array(dim).fill(0) as number[];
    owner[0] = 1;
    if (options.seed)
      localStorage.setItem(
        "glint-speaker-voiceprint",
        JSON.stringify({
          version: 1,
          model: "wespeaker-resnet34-LM",
          dim,
          samples: 2,
          enrolledAt: Date.now(),
          vector: owner,
        }),
      );
    const stranger = new Array(dim).fill(0) as number[];
    stranger[1] = 1;
    let calls = 0;
    (window as unknown as { __glintSpeaker: unknown }).__glintSpeaker = {
      embed: () => {
        const [verdict, delay] =
          options.plan[Math.min(calls++, options.plan.length - 1)].split(":");
        const vector = Float32Array.from(
          verdict === "owner" ? owner : stranger,
        );
        const ms = Number(delay ?? 0);
        if (ms > 0)
          return new Promise<Float32Array>((resolve) =>
            setTimeout(() => resolve(vector), ms),
          );
        return vector;
      },
    };
  }, { plan, seed });
}

async function say(page: Page) {
  await page.evaluate(
    () =>
      (window as unknown as { voiceFixture: { say: () => void } })
        .voiceFixture.say(),
  );
}

async function sayLong(page: Page) {
  // 1.5 s tone: turn audio lands well above the 0.8 s speaker-check
  // bypass, unlike the 700 ms say() that straddles it.
  await page.evaluate(
    () =>
      (
        window as unknown as {
          voiceFixture: { blip: (ms: number) => void };
        }
      ).voiceFixture.blip(1500),
  );
}


test("speaker lock answers the owner and ignores a stranger's voice", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await syntheticSpeaker(page, ["owner", "stranger", "stranger:800"]);
  await page.addInitScript(() => {
    localStorage.setItem("glint-streaming-voice", "0");
    // Gating tests isolate the speaker verdict; ML tone hallucinations
    // would make turn bounds nondeterministic.
    localStorage.setItem("glint-ml-vad", "0");
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
    agentHits = 0,
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
    // The fast stranger verdict must land mid-transcription so the abort
    // happens before any "you" message posts.
    if (voiceCalls === 2) await new Promise((r) => setTimeout(r, 400));
    await route.fulfill({ json: { transcript: "hello there", epoch: request.epoch } });
  });
  await page.route("**/api/agent/stream", async (route) => {
    agentHits++;
    const request = route.request().postDataJSON(),
      text = "Hi, owner. ";
    // The slow stranger verdict (300 ms) must land before the first reply
    // token so the aborted turn renders no reply at all.
    if (agentHits === 2) await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch: request.epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  // Owner turn: answered normally.
  await sayLong(page);
  await expect(page.getByText("Hi, owner.", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  expect(agentHits).toBe(1);
  // Past the 500 ms barge-guard grace after the reply, or the turn is
  // dropped as probable echo before any check runs.
  await page.waitForTimeout(700);
  // Fast stranger: killed before transcription finishes — no agent hit,
  // no "you" message, just the transient note.
  await sayLong(page);
  await page.waitForTimeout(5000);
  expect(agentHits).toBe(1);
  await expect(page.locator(".companion-message.from-you")).toHaveCount(1);
  await expect(
    page.locator(".companion-speaker-note", { hasText: "Ignored" }),
  ).toBeVisible();
  // Drain the fast verdict's transient note so the next assertion cannot
  // pass on stale UI.
  await expect(page.locator(".companion-speaker-note")).toBeHidden({
    timeout: 12000,
  });
  // Slow stranger: the "you" message posts, then the verdict lands and the
  // turn dies marked ignored with no reply.
  await sayLong(page);
  await expect(
    page.locator(".companion-message.from-you small", {
      hasText: "Ignored",
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".companion-message.from-you")).toHaveCount(2);
  await expect(page.locator(".companion-message.from-glint")).toHaveCount(1);
  expect(agentHits).toBe(2);
  await page.getByRole("button", { name: "End voice chat" }).click();
});

test("a stranger's barge stops the reply and resumes the interrupted speech", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await syntheticSpeaker(page, ["owner", "stranger:400"]);
  await page.addInitScript(() => {
    localStorage.setItem("glint-streaming-voice", "0");
    localStorage.setItem("glint-ml-vad", "0");
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
        transcript: voiceCalls === 1 ? "Tell me about braids." : "stranger words",
        epoch: request.epoch,
      },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const request = route.request().postDataJSON();
    turns++;
    const text =
      turns === 1
        ? "First sentence here. Second sentence here. "
        : "Stranger reply here. ";
    // The stranger's verdict (400 ms) must land before the first reply
    // token so the interrupted speech is still preserved to resume.
    if (turns === 2) await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch: request.epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  await sayLong(page);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { spoken: string[] }).spoken.length,
        ),
      { timeout: 15000 },
    )
    .toBe(1);
  // Past the 500 ms barge-guard grace so the burst counts as an interrupt.
  await page.waitForTimeout(600);
  const canceledBefore = await page.evaluate(
    () => (window as unknown as { canceled: number }).canceled,
  );
  await sayLong(page);
  // The stranger interrupts, then the verdict resumes the owner's reply
  // and marks the turn ignored; the stranger's own reply never speaks.
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { canceled: number }).canceled),
    )
    .toBeGreaterThan(canceledBefore);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { spoken: string[] }).spoken,
        ),
      { timeout: 15000 },
    )
    .toEqual(["First sentence here.", "Second sentence here."]);
  await expect(
    page.locator(".companion-message.from-you small", {
      hasText: "Ignored",
    }),
  ).toBeVisible();
  await page.waitForTimeout(2000);
  expect(turns).toBe(2);
  expect(
    await page.evaluate(
      () => (window as unknown as { spoken: string[] }).spoken,
    ),
  ).toEqual(["First sentence here.", "Second sentence here."]);
  await expect(page.locator(".companion-message.from-glint")).toHaveCount(1);
  await page.getByRole("button", { name: "End voice chat" }).click();
});

test("voice enrollment teaches the lock and turning it off clears it", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await syntheticSpeaker(page, ["owner"], false);
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch(),
      view = await response.json();
    view.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: view });
  });
  await page.goto("/");
  await expect(page.getByText("Voice lock: Off")).toBeVisible();
  await page
    .getByRole("button", { name: "Teach Glint your voice" })
    .click();
  await expect(page.getByText("Recording sample 1 of 2")).toBeVisible();
  // Audible speech inside each 4 s window (the silence guard rejects
  // inaudible samples instead of minting a garbage voiceprint).
  await page.waitForTimeout(1000);
  await say(page);
  await expect(page.getByText("Recording sample 2 of 2")).toBeVisible({
    timeout: 15000,
  });
  await say(page);
  await expect(page.getByText("Voice lock: On")).toBeVisible({
    timeout: 20000,
  });
  const stored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("glint-speaker-voiceprint") ?? "null",
    ),
  );
  expect(stored.model).toBe("wespeaker-resnet34-LM");
  expect(stored.vector).toHaveLength(256);
  expect(stored.vector[0]).toBeCloseTo(1, 6);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Voice lock: Off")).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("glint-speaker-voiceprint"),
    ),
  ).toBeNull();
});

test("short turns bypass the speaker check instead of stranding backchannels", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await syntheticSpeaker(page, ["stranger"]);
  await page.addInitScript(() => {
    localStorage.setItem("glint-streaming-voice", "0");
    localStorage.setItem("glint-ml-vad", "0");
  });
  await page.routeWebSocket("**/events", () => {});
  let state: Record<string, unknown>,
    epoch = 0,
    agentHits = 0;
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
      json: { transcript: "yes", epoch: request.epoch },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    agentHits++;
    const request = route.request().postDataJSON(),
      text = "On it. ";
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch: request.epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  // 400 ms of voice: a sent turn, but under the 0.8 s check floor, so it
  // is answered without consulting the (stranger) mock.
  await page.evaluate(
    () =>
      (
        window as unknown as {
          voiceFixture: { blip: (ms: number) => void };
        }
      ).voiceFixture.blip(400),
  );
  await expect(page.getByText("On it.", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  expect(agentHits).toBe(1);
  await expect(
    page.locator(".companion-message.from-you small"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "End voice chat" }).click();
});

test("streamed turns use the settled speaker verdict without waiting", async ({
  page,
}) => {
  await syntheticMicrophone(page);
  await syntheticSpeaker(page, ["stranger", "owner"]);
  await page.addInitScript(() => {
    localStorage.setItem("glint-ml-vad", "0");
  });
  await page.routeWebSocket("**/events", () => {});
  // Minimal voice-stream server: opens lanes, answers each ended turn
  // after a beat so the instant mock verdict is always settled first.
  let turnId = 0;
  await page.routeWebSocket("**/voice-stream", (ws) => {
    ws.onMessage(async (message) => {
      // Raw payloads: JSON control frames, or binary audio to ignore.
      const text =
        typeof message === "string" ? message : message.toString("utf8");
      let parsed: { type?: string };
      try {
        parsed = JSON.parse(text) as { type?: string };
      } catch {
        return;
      }
      if (parsed.type === "open")
        ws.send(JSON.stringify({ type: "opened" }));
      if (parsed.type === "end") {
        turnId++;
        await new Promise((r) => setTimeout(r, 300));
        ws.send(
          JSON.stringify({ type: "turn", turnId, transcript: "hello there" }),
        );
      }
    });
  });
  let state: Record<string, unknown>,
    epoch = 0,
    agentHits = 0,
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
    await route.fulfill({ json: { transcript: "hello there", epoch: request.epoch } });
  });
  await page.route("**/api/agent/stream", async (route) => {
    agentHits++;
    const request = route.request().postDataJSON(),
      text = "Hi, owner. ";
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ type: "delta", text })}\n\n` +
        `data: ${JSON.stringify({ type: "done", reply: { message: text, sources: [], searched: false, epoch: request.epoch } })}\n\n`,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Talk to Glint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End voice chat" }),
  ).toBeVisible();
  // Stranger first: settled verdict kills the turn before any agent call.
  await sayLong(page);
  await expect(
    page.locator(".companion-speaker-note", { hasText: "Ignored" }),
  ).toBeVisible({ timeout: 15000 });
  expect(agentHits).toBe(0);
  await expect(page.locator(".companion-message.from-you")).toHaveCount(0);
  // Owner next: the settled owner verdict proceeds straight to a reply.
  await sayLong(page);
  await expect(page.getByText("Hi, owner.", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  expect(agentHits).toBe(1);
  // Pure streamed run: the WAV fallback never fired.
  expect(voiceCalls).toBe(0);
  await page.getByRole("button", { name: "End voice chat" }).click();
});
