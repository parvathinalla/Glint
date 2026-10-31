import { test, expect } from "./fixture";
test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

test("phone camera can flip and keeps the recognized words visible in fullscreen", async ({ page, context }) => {
  await context.grantPermissions(["camera", "microphone"]);
  await page.addInitScript(() => {
    localStorage.setItem("glint-ml-vad", "0");
    const state = window as unknown as { cameraDirections: string[]; oldCamera?: MediaStreamTrack };
    state.cameraDirections = [];
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const media = await getMedia(constraints);
      if (constraints?.video && typeof constraints.video === "object") {
        const mode = constraints.video.facingMode as { ideal: string };
        state.cameraDirections.push(mode.ideal);
        const track = media.getVideoTracks()[0];
        if (!state.oldCamera) state.oldCamera = track;
        const settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), facingMode: mode.ideal });
      }
      return media;
    };
  });
  let view: Record<string, unknown>;
  await page.routeWebSocket("**/events", () => {});
  await page.route("**/api/session", async route => {
    view = await (await route.fetch()).json();
    view.key = { connected: true, models: ["muse-spark-test"] };
    await route.fulfill({ json: view });
  });
  await page.route("**/api/vision/stop", route => route.fulfill({ json: view }));
  await page.route("**/api/observe", route => route.fulfill({ status: 409, json: { message: "Fixture observation paused" } }));
  await page.routeWebSocket("**/voice-stream", ws => ws.onMessage(message => {
    if (typeof message === "string" && JSON.parse(message).type === "open") {
      ws.send(JSON.stringify({ type: "opened" }));
    }
  }));
  await page.route("**/api/agent/stream", async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { message: "Ready.", sources: [], searched: false, epoch: body.epoch } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mute spoken replies" }).click();
  // A recognized question remains visible over the fullscreen camera.
  await page.getByRole("textbox", { name: "Message Glint" }).fill("Where is the cup?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Ready.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.locator(".camera-transcript")).toHaveText("You: Where is the cup?");
  await page.getByRole("button", { name: "Switch to front camera" }).click();
  await expect(page.getByRole("button", { name: "Switch to back camera" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { cameraDirections: string[] }).cameraDirections)).toEqual(["environment", "user"]);
  expect(await page.evaluate(() => (window as unknown as { oldCamera: MediaStreamTrack }).oldCamera.readyState)).toBe("ended");
  await expect(page.locator(".camera-transcript")).toHaveText("You: Where is the cup?");
  await page.screenshot({ path: "test-results/camera-controls-phone.png" });
});
