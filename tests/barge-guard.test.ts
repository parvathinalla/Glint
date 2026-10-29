import { describe, expect, it } from "vitest";
import { BargeGuard, ECHO_BARGE_GRACE_MS } from "../src/barge-guard.ts";

describe("barge-in echo guard", () => {
  it("passes turns when nothing was spoken yet", () => {
    const guard = new BargeGuard();
    expect(guard.turnStarted()).toBe(false);
    expect(guard.turnReady()).toBe(false);
  });
  it("suppresses a turn that starts within the grace window after speech", () => {
    let now = 10000;
    const guard = new BargeGuard(ECHO_BARGE_GRACE_MS, () => now);
    guard.markSpoke();
    now += ECHO_BARGE_GRACE_MS - 1;
    expect(guard.turnStarted()).toBe(true);
    expect(guard.turnReady()).toBe(true);
    expect(guard.turnReady()).toBe(false);
  });
  it("passes a turn that starts once the grace window has elapsed", () => {
    let now = 5000;
    const guard = new BargeGuard(ECHO_BARGE_GRACE_MS, () => now);
    guard.markSpoke();
    now += ECHO_BARGE_GRACE_MS;
    expect(guard.turnStarted()).toBe(false);
    expect(guard.turnReady()).toBe(false);
  });
  it("re-arms on every spoken phrase", () => {
    let now = 0;
    const guard = new BargeGuard(1500, () => now);
    guard.markSpoke();
    now += 1400;
    guard.markSpoke();
    now += 1400;
    expect(guard.turnStarted()).toBe(true);
  });
  it("lets a later turn overwrite a stale suppression", () => {
    let now = 0;
    const guard = new BargeGuard(1500, () => now);
    guard.markSpoke();
    expect(guard.turnStarted()).toBe(true);
    now += 5000;
    expect(guard.turnStarted()).toBe(false);
    expect(guard.turnReady()).toBe(false);
  });
});
