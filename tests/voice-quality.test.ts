import { expect, it } from "vitest";
import { evaluateVoiceQuality } from "../shared/voice-quality.ts";

it("never passes an empty benchmark or invents missing latency", () => {
  const report = evaluateVoiceQuality({ cases: [] });
  expect(report.preliminaryGatePassed).toBe(false);
  expect(report.acceptedOwnerPercent).toBeNull();
  expect(report.detectedTurnEndToBrowserAudioP95Ms).toBeNull();
  expect(report.missingEvidence.length).toBeGreaterThan(0);
});

it("counts actual dispatches, missed owner turns, false activations and missing playback", () => {
  const sample = { language: "telugu", device: "android", events: [{ turn: 1, stage: "turn-accepted", elapsedMs: 1 }] };
  const report = evaluateVoiceQuality({ cases: [
    { ...sample, scenario: "quiet", expectedReply: true },
    { ...sample, scenario: "noise", expectedReply: true, events: [{ turn: 1, stage: "reply-dispatched", elapsedMs: 2 }] },
    { ...sample, scenario: "background", expectedReply: false, events: [{ turn: 1, stage: "reply-dispatched", elapsedMs: 2 }] },
  ] });
  expect(report.acceptedOwnerPercent).toBe(50);
  expect(report.backgroundActivationPercent).toBe(100);
  expect(report.missingEvidence).toContain("Some replies have no browser playback measurement.");
  expect(report.productionReady).toBe(false);
});

it("rejects private extra fields and mixed-turn cases", () => {
  expect(() => evaluateVoiceQuality({ cases: [], transcript: "private" })).toThrow();
  expect(() => evaluateVoiceQuality({ cases: [{ scenario: "quiet", language: "mixed", device: "iphone", expectedReply: true,
    events: [{ turn: 1, stage: "speech-start", elapsedMs: 0 }, { turn: 2, stage: "speech-end", elapsedMs: 1 }] }] })).toThrow();
});

it("checks coverage and exact acceptance/false-activation boundaries without claiming production readiness", () => {
  const scenarios = ["quiet", "noise", "overlap", "short", "network"] as const;
  const cases = Array.from({ length: 200 }, (_, index) => ({
    scenario: index < 100 ? scenarios[index % 5] : "background",
    language: ["telugu", "english", "mixed"][index % 3],
    device: index % 2 ? "android" : "iphone",
    expectedReply: index < 100,
    events: index < 100
      ? [{ turn: 1, stage: "reply-dispatched", elapsedMs: 2 }, { turn: 1, stage: "audio-scheduled", elapsedMs: 1000, durationMs: 1000 }]
      : [{ turn: 1, stage: "turn-rejected", elapsedMs: 2 }],
  }));
  const good = evaluateVoiceQuality({ cases });
  expect(good.missingEvidence).toEqual([]);
  expect(good.preliminaryGatePassed).toBe(true);
  expect(good.productionReady).toBe(false);
  for (let i = 100; i < 105; i++) cases[i].events = [{ turn: 1, stage: "reply-dispatched", elapsedMs: 2 }];
  const bad = evaluateVoiceQuality({ cases });
  expect(bad.backgroundActivationPercent).toBe(5);
  expect(bad.preliminaryGatePassed).toBe(false);
});
