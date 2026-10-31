import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
test("welcome, source confirmation, replay, progress, and alternate order", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0, { timeout: 10000 });
  await expect(
    page.getByLabel("Message Glint"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/glint-welcome-desktop.png",
    fullPage: true,
  });
  await expect(page.locator(".sidebar, .breadcrumb")).toHaveCount(0);
  await expect(
    page.getByText("A LITTLE GUIDANCE GOES A LONG WAY", { exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 800, height: 900 });
  expect((await page.locator("main").boundingBox())!.x).toBe(0);
  await page.screenshot({
    path: "test-results/glint-clean-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .getByRole("button", { name: "Try desk organizer example" })
    .click();
  await expect(
    page.getByRole("button", { name: "Start replay" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "View instructions" }).click();
  await expect(page.locator(".modal .source-text")).toBeVisible();
  await expect(
    page.getByText("ORIGINAL DEMO · NOT A MANUFACTURER MANUAL", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm this exact source" })
    .click();
  await page.getByRole("button", { name: "Start replay" }).click();
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(
    page.getByText(/This is a replay, not an assessment/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I’ve checked this step myself" })
    .click();
  await page.locator("summary").filter({ hasText: "All steps" }).click();
  await page
    .getByRole("button", {
      name: "Report Slide the right panel into the matching base slot.",
    })
    .click();
  await expect(page.getByText("2 / 5 reported")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Report Fit the back divider after both side panels are seated.",
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Report Slide the left panel into the matching base slot.",
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Report Fit the back divider after both side panels are seated.",
    }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/glint-workspace-desktop.png",
    fullPage: true,
  });
});
test("real browser camera capture, bounded buffer, pause and stop using synthetic device", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera"]);
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0, { timeout: 10000 });
  await page
    .getByRole("button", { name: "Try desk organizer example" })
    .click();
  await page.getByRole("button", { name: "Confirm this exact source" }).click();
  await page.getByRole("button", { name: "Use my camera instead" }).click();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByText("Camera active", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.locator(".buffer-note").textContent())
    .toMatch(/[1-9]\d* frames/);
  await expect(
    page.getByRole("button", { name: "Check now", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/glint-camera-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.srcObject === null),
    )
    .toBe(true);
  await expect(page.getByText("Camera off", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByText("Camera active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.srcObject === null),
    )
    .toBe(true);
});
test("BYOK field and truthful capability disclosure without calling the provider", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0, { timeout: 10000 });
  await page.getByRole("button", { name: "Connect model" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#provider-key")).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Meta Model API" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .locator(".provider-choice, .disclosure, .billing-note"),
  ).toHaveCount(0);
  await page.locator("#provider-key").fill("TEST_ONLY_NOT_SUBMITTED");
  const stored = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(stored.session).toEqual({});
  expect(stored.local).toEqual({ "glint-key-gate": "1" });
  expect(JSON.stringify(stored)).not.toContain("TEST_ONLY_NOT_SUBMITTED");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("companion first, optional single-link instructions and no setup form", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Talk to Glint" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open camera" })).toBeVisible();
  await expect(page.getByLabel("Task name", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Exact product or task version")).toHaveCount(0);
  await page.getByRole("button", { name: "Add instructions link" }).click();
  const dialog = page.getByRole("dialog", { name: "Add instructions link" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input")).toHaveCount(1);
  await dialog
    .getByLabel("Product or manual link")
    .fill("https://www.ikea.com/us/en/");
  await dialog.getByRole("button", { name: "Let Glint read it" }).click();
  await expect(
    page.getByRole("dialog", { name: "Meta Model API" }),
  ).toBeVisible();
});
test("mobile layout and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0, { timeout: 10000 });
  await expect(
    page.getByLabel("Message Glint"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/glint-welcome-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Try desk organizer example" })
    .click();
  await page.getByRole("button", { name: "Confirm this exact source" }).click();
  await page.getByRole("button", { name: "Start replay" }).click();
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(
    page.getByText(/This is a replay, not an assessment/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/glint-workspace-mobile.png",
    fullPage: true,
  });
});
test("critical flows meet automated WCAG checks and private server data is not served", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0, { timeout: 10000 });
  await expect(
    page.getByLabel("Message Glint"),
  ).toBeVisible();
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        detail: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Try desk organizer example" })
    .click();
  await page.getByRole("button", { name: "Confirm this exact source" }).click();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        detail: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  for (const path of [
    "/.data/glint.sqlite",
    "/server/engine.ts",
    "/.env.local",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(403);
  }
});
test("key and source dialogs expose accessible names and readable controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("opening")).toHaveCount(0, { timeout: 10000 });
  await page.getByRole("button", { name: "Connect model" }).click();
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        detail: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Try desk organizer example" })
    .click();
  await page.getByRole("button", { name: "View instructions" }).click();
  await expect(page.locator(".modal .source-text")).toBeVisible();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        detail: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
