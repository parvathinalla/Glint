import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ reducedMotion: "reduce" });

test("real local pose worker loads and detects the attributed public sample", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto("/");
  const data =
    "data:image/png;base64," +
    readFileSync("tests/fixtures/pose-doc.png").toString("base64");
  const count = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return new Promise<number>((resolve, reject) => {
      const worker = new Worker("/vision-observer.js");
      const timer = setTimeout(() => {
        worker.terminate();
        reject(Error("Local vision initialization timed out"));
      }, 30000);
      worker.onmessage = async (event) => {
        if (event.data.kind === "unavailable") {
          clearTimeout(timer);
          worker.terminate();
          reject(Error(event.data.reason));
        }
        if (event.data.kind === "ready") {
          const bitmap = await createImageBitmap(image);
          worker.postMessage({ kind: "frame", bitmap, at: 1000 }, [bitmap]);
        }
        if (event.data.kind === "pose") {
          clearTimeout(timer);
          worker.terminate();
          resolve(event.data.landmarks.length);
        }
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        reject(Error("Local vision worker failed"));
      };
      worker.postMessage({ kind: "init" });
    });
  }, data);
  expect(count).toBe(33);
});

test("camera observes activity without a question, reacts to a hand, and sends frame history with questions", async ({
  page,
  context,
}) => {
  test.setTimeout(45000);
  await context.grantPermissions(["camera"]);
  await page.routeWebSocket("**/events", () => {});
  let view: Record<string, unknown>,
    epoch = 0,
    observations = 0,
    questionFrames = 0;
  await page.route("**/api/session", async (route) => {
    view = await (await route.fetch()).json();
    view.key = { connected: true, models: ["muse-spark-test"] };
    view.epoch = epoch;
    await route.fulfill({ json: view });
  });
  for (const endpoint of ["phase", "vision/stop"])
    await page.route(`**/api/${endpoint}`, async (route) => {
      epoch++;
      view.epoch = epoch;
      await route.fulfill({ json: view });
    });
  await page.route("**/api/observe", async (route) => {
    const input = route.request().postDataJSON();
    observations++;
    expect(input.frames.length).toBeGreaterThanOrEqual(2);
    expect(input.frames.length).toBeLessThanOrEqual(6);
    expect(input.frames[0].capturedAt).toBeLessThan(
      input.frames.at(-1).capturedAt,
    );
    await route.fulfill({
      json: {
        activity: "stirring ingredients in a bowl",
        scene: "Bowl and spoon in view",
        confidence: "high",
        changes: ["Spoon moves around bowl"],
        say: "It looks like you're stirring ingredients.",
        from: input.frames[0].capturedAt,
        capturedAt: input.frames.at(-1).capturedAt,
        epoch: input.epoch,
      },
    });
  });
  await page.route("**/api/agent/stream", async (route) => {
    const input = route.request().postDataJSON();
    questionFrames = input.frames.length;
    await route.fulfill({
      json: {
        message: "You're stirring ingredients in the bowl. What are we making?",
        sources: [],
        searched: false,
        epoch: input.epoch,
      },
    });
  });
  await page.addInitScript(() => {
    const fixture = window as unknown as { raised: boolean };
    fixture.raised = false;
    const OriginalWorker = window.Worker;
    window.Worker = function (url: string | URL, options?: WorkerOptions) {
      if (!String(url).endsWith("/vision-observer.js"))
        return new OriginalWorker(url, options);
      const stub = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        ended: false,
        postMessage(data: { kind: string; bitmap?: ImageBitmap; at: number }) {
          if (data.kind === "init")
            queueMicrotask(() =>
              stub.onmessage?.(
                new MessageEvent("message", { data: { kind: "ready" } }),
              ),
            );
          else {
            data.bitmap?.close();
            const landmarks = Array.from({ length: 33 }, () => ({
              x: 0.5,
              y: 0.5,
              visibility: 1,
            }));
            landmarks[15].y = fixture.raised ? 0.2 : 0.8;
            landmarks[16].y = 0.8;
            if (!stub.ended)
              queueMicrotask(() =>
                stub.onmessage?.(
                  new MessageEvent("message", {
                    data: { kind: "pose", landmarks, at: data.at },
                  }),
                ),
              );
          }
        },
        terminate() {
          stub.ended = true;
        },
      };
      return stub;
    } as unknown as typeof Worker;
    const originalMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints?.audio || constraints.video)
        return originalMedia(constraints);
      const audio = new AudioContext(),
        output = audio.createMediaStreamDestination();
      await audio.resume();
      return output.stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page
    .getByRole("button", { name: "Exit full screen camera", exact: true })
    .click();
  await expect.poll(() => observations, { timeout: 15000 }).toBeGreaterThan(0);
  await expect(
    page.getByText("Seeing: stirring ingredients in a bowl", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("It looks like you're stirring ingredients.", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { raised: boolean }).raised = true;
  });
  await expect(
    page.getByText(
      "Hi! I saw you raise your hand.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 10000 });
  await page.getByLabel("Message Glint").fill("What am I doing?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(
      "You're stirring ingredients in the bowl. What are we making?",
      { exact: true },
    ),
  ).toBeVisible();
  expect(questionFrames).toBeGreaterThan(1);
  await expect(page.getByText(/In the image you shared/)).toHaveCount(0);
  await expect(page.getByText(/From your captured image/)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/glint-visual-awareness-fixture.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  const before = observations;
  await page.waitForTimeout(6500);
  expect(observations).toBe(before);
  await page
    .getByRole("button", { name: "End voice chat", exact: true })
    .click();
});
