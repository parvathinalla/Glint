import { afterEach, expect, it, vi } from "vitest";
import { waitForSpeaker } from "../src/speaker-gate.ts";
import type { SpeakerCheck } from "../src/speaker-id.ts";

afterEach(() => vi.useRealTimers());
const check = (promise: SpeakerCheck["promise"]): SpeakerCheck => ({ audio: new Blob(), promise });

it("does not grant permission before a delayed owner check completes", async () => {
  let release!: (value: "owner") => void;
  const dispatch = vi.fn();
  const pending = waitForSpeaker(check(new Promise(resolve => { release = resolve; })), new AbortController().signal)
    .then(verdict => { if (verdict === "owner") dispatch(); });
  await Promise.resolve();
  expect(dispatch).not.toHaveBeenCalled();
  release("owner");
  await pending;
  expect(dispatch).toHaveBeenCalledOnce();
});

it("never grants permission for strangers, missing checks, short clips, or failed inference", async () => {
  const signal = new AbortController().signal;
  await expect(waitForSpeaker(check(Promise.resolve("stranger")), signal)).resolves.toBe("stranger");
  await expect(waitForSpeaker(null, signal)).resolves.toBe("unknown");
  await expect(waitForSpeaker(check(Promise.resolve(null)), signal)).resolves.toBe("unknown");
  await expect(waitForSpeaker(check(Promise.reject(Error("model unavailable"))), signal)).resolves.toBe("unknown");
});

it("a stuck check becomes unknown and a late owner cannot authorize a reply", async () => {
  vi.useFakeTimers();
  let release!: (value: "owner") => void;
  const pending = waitForSpeaker(check(new Promise(resolve => { release = resolve; })), new AbortController().signal);
  await vi.advanceTimersByTimeAsync(3000);
  await expect(pending).resolves.toBe("unknown");
  release("owner");
  await expect(pending).resolves.toBe("unknown");
});

it("canceling a check rejects immediately even if inference never finishes", async () => {
  const controller = new AbortController();
  const pending = waitForSpeaker(check(new Promise(() => {})), controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow();
  await expect(waitForSpeaker(null, controller.signal)).rejects.toThrow();
});
