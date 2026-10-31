import { test, expect } from "./fixture";

for (const [name, width, height] of [
  ["desktop", 1280, 800],
  ["mobile", 390, 844],
] as const) {
  test(`existing compact rig animates through a full gait and turn on ${name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.clock.install({ time: new Date("2026-10-28T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-28T12:00:00.100Z"));
    await page.goto("/");
    await expect(page.getByTestId("opening")).toHaveAttribute(
      "data-phase",
      "walking",
    );
    const measure = () =>
      page.locator(".opening-foot-front").evaluate((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    await page.clock.runFor(1240);
    const first = await measure();
    const before = await page.locator(".opening-rig").boundingBox();
    await page.clock.runFor(70);
    const second = await measure();
    const after = await page.locator(".opening-rig").boundingBox();
    // Existing compact foot motion and site sequence remain live after material changes.
    expect(Number.isFinite(first.x) && Number.isFinite(second.y)).toBe(true);
    expect(first.x).not.toBe(second.x);
    expect(after!.x).toBeGreaterThan(before!.x);
    await expect(page.locator(".opening-shell")).toHaveCount(1);
    // Capture seven poses spanning more than a complete 600 ms gait cycle.
    for (let i = 0; i < 7; i++) {
      await page.clock.runFor(100);
      const box = await page.locator(".opening-rig").boundingBox();
      const x = Math.max(0, box!.x - 12),
        y = Math.max(0, box!.y - 12);
      await page.screenshot({
        path: `test-results/glint-rig-${name}-gait-${i + 1}.png`,
        clip: {
          x,
          y,
          width: Math.min(width - x, box!.width + 24),
          height: Math.min(height - y, box!.height + 24),
        },
      });
    }
    await page.clock.runFor(1740); // 3.75 s, inside the turn.
    await expect(page.getByTestId("opening")).toHaveAttribute(
      "data-phase",
      "turning",
    );
    for (const selector of [
      ".opening-shell",
      ".opening-profile",
      ".opening-front",
    ]) {
      expect(
        await page
          .locator(selector)
          .evaluate((node) => getComputedStyle(node).transform),
      ).toBe("none");
    }
    await page.screenshot({
      path: `test-results/glint-rig-${name}-turn-midpoint.png`,
    });
    await page.clock.runFor(600);
    await expect(page.getByTestId("opening")).toHaveAttribute(
      "data-phase",
      "facing",
    );
    await page.screenshot({ path: `test-results/glint-rig-${name}-front.png` });
    await page.clock.runFor(500);
    await expect(page.getByTestId("opening")).toHaveAttribute(
      "data-phase",
      "bloom",
    );
    await page.screenshot({
      path: `test-results/glint-rig-${name}-huge-bloom.png`,
    });
    const light = await page.locator(".opening-light").boundingBox();
    expect(light!.width).toBeGreaterThanOrEqual(width);
    expect(light!.height).toBeGreaterThanOrEqual(height);
    await page.clock.runFor(1500);
    await expect(page.getByTestId("opening")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open conversation", exact:true }),
    ).toBeVisible();
  });
}
