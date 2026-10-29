import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("opening walks in profile, turns, blooms, then reveals the untouched site", async ({
  browser,
}) => {
  test.setTimeout(60000); // Several phase screenshots plus recording finalization on local Windows.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: process.env.GLINT_RECORD_INTRO === "1" ? {
      dir: "test-results/opening-video",
      size: { width: 1280, height: 800 },
    } : undefined,
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-10-28T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-28T12:00:01Z"));
  let media = 0;
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = (...args) => {
      (window as unknown as { mediaRequested: boolean }).mediaRequested = true;
      return original(...args);
    };
  });
  page.on("request", (r) => {
    if (
      /\/api\/(key|check|chat|phase|agent|voice|observe)$/.test(
        new URL(r.url()).pathname,
      )
    )
      media++;
  });
  try {
    await page.goto("/");
    const intro = page.getByTestId("opening");
    await expect(intro).toHaveAttribute("data-phase", "walking");
    await expect(
      page.getByRole("heading", { name: /What are we working on/ }),
    ).not.toBeVisible();
    await expect(page.locator(".site-entrance")).toHaveAttribute("inert", "");
    await expect(page.locator(".opening-profile")).toHaveCSS("opacity", "1");
    await expect(page.locator(".opening-front")).toHaveCSS("opacity", "0");
    await page.clock.runFor(1750);
    await page.screenshot({
      path: "test-results/glint-opening-01-profile-desktop.png",
    });
    await page.clock.runFor(1450);
    await page.screenshot({
      path: "test-results/glint-opening-02-centered-desktop.png",
    });
    await page.clock.runFor(350);
    await page.clock.runFor(250);
    await page.screenshot({
      path: "test-results/glint-opening-turn-midpoint-desktop.png",
    });
    await page.clock.runFor(370);
    await page.screenshot({
      path: "test-results/glint-opening-front-beat-desktop.png",
    });
    await page.clock.runFor(330);
    await page.clock.runFor(100);
    await expect(page.locator(".opening-front")).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: "test-results/glint-opening-03-light-desktop.png",
    });
    await page.clock.runFor(550);
    await page.screenshot({
      path: "test-results/glint-opening-huge-bloom-desktop.png",
    });
    const light = await page.locator(".opening-light").boundingBox();
    expect(light!.width).toBeGreaterThanOrEqual(1280);
    expect(light!.height).toBeGreaterThanOrEqual(800);
    await page.clock.runFor(300);
    await expect(intro).toHaveAttribute("data-phase", "revealing");
    await page.clock.runFor(120);
    await page.screenshot({
      path: "test-results/glint-opening-dissolve-desktop.png",
    });
    await page.clock.runFor(530);
    await expect(intro).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /What are we working on/ }),
    ).toBeVisible();
    await expect(page.locator("main")).toBeFocused();
    await page.screenshot({
      path: "test-results/glint-opening-04-revealed-desktop.png",
    });
    expect(media).toBe(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { mediaRequested?: boolean }).mediaRequested,
      ),
    ).toBeUndefined();
    await page
      .getByRole("button", { name: "Try desk organizer example" })
      .click();
    await expect(intro).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Confirm this exact source" }),
    ).toBeVisible();
  } finally {
    const video = page.video();
    await context.close();
    if (video) {
      mkdirSync("test-results", { recursive: true });
      await video.saveAs("test-results/glint-opening-desktop.webm");
    }
  }
});

test("mobile opening stays within the viewport and reveals without layout overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date("2026-10-28T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-28T12:00:01Z"));
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveAttribute(
    "data-phase",
    "walking",
  );
  await page.clock.runFor(1750);
  await page.screenshot({
    path: "test-results/glint-opening-01-profile-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.clock.runFor(2050);
  await expect(page.getByTestId("opening")).toHaveAttribute(
    "data-phase",
    "turning",
  );
  await page.screenshot({
    path: "test-results/glint-opening-turn-midpoint-mobile.png",
  });
  await page.clock.runFor(400);
  await expect(page.getByTestId("opening")).toHaveAttribute(
    "data-phase",
    "facing",
  );
  await page.screenshot({
    path: "test-results/glint-opening-front-beat-mobile.png",
  });
  await page.clock.runFor(450);
  await page.screenshot({
    path: "test-results/glint-opening-03-light-mobile.png",
  });
  const light = await page.locator(".opening-light").boundingBox();
  expect(light!.width).toBeGreaterThanOrEqual(390);
  expect(light!.height).toBeGreaterThanOrEqual(844);
  await page.clock.runFor(450);
  await page.screenshot({
    path: "test-results/glint-opening-huge-bloom-mobile.png",
  });
  await page.clock.runFor(470);
  await expect(page.getByTestId("opening")).toHaveAttribute(
    "data-phase",
    "revealing",
  );
  await page.screenshot({
    path: "test-results/glint-opening-dissolve-mobile.png",
  });
  await page.clock.runFor(600);
  await expect(page.getByTestId("opening")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /What are we working on/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/glint-opening-04-revealed-mobile.png",
  });
});

test("reduced motion bypasses the walk and light; keyboard skip releases the site", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /What are we working on/ }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await expect(page.getByTestId("opening")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Skip intro" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("opening")).toHaveCount(0);
  await expect(page.locator(".site-entrance")).not.toHaveAttribute("inert");
  await expect(page.locator("main")).toBeFocused();
});
