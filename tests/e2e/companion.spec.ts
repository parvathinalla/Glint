import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
test.use({ reducedMotion: "reduce" });

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
    page.getByRole("button", { name: "Stop camera", exact: true }),
  ).toBeVisible();
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
        speak: (utterance: SpeechSynthesisUtterance) =>
          fixture.spoken.push(utterance.text),
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
