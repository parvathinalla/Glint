import { test as base } from "@playwright/test";

/**
 * Returning-user fixture: the first-visit key gate is already dismissed, so
 * specs cover site behavior without the upfront dialog. First-visit gate
 * coverage lives in key-gate.spec.ts, which uses the base test directly.
 */
export const test = base.extend<{ keyGateDismissed: void }>({
  keyGateDismissed: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        localStorage.setItem("glint-key-gate", "1");
        // Legacy-flow regression specs; coordinator specs explicitly enable the production path.
        localStorage.setItem("glint-camera-tools", "0");
        sessionStorage.setItem("glint-started", "1");
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
